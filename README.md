# 工程造价规范检索助手（MVP）

面向工程造价师、预算员、造价咨询团队的轻量工具站：`查规范 / 查依据 / 问规则 / 试用`。

技术栈：`Next.js 14 + TypeScript + Tailwind + Prisma + SQLite + Docker + Nginx`。

## 1. 生产部署前检查结果

本仓库已按以下目标完成部署收敛：

1. Dockerfile 可用于生产构建与启动（包含 `prisma migrate deploy`）。
2. `docker-compose.yml` 已拆分 `web + nginx`，反代链路完整。
3. Nginx 反代配置已提供：`deploy/nginx/default.conf`。
4. 环境变量模板齐全：`.env.example`。
5. SQLite 持久化目录明确：`./data/sqlite`（挂载到容器 `/app/data`）。
6. 日志目录明确：
   - 应用日志：`./logs/web/app.log`
   - Nginx 日志：`./logs/nginx/access.log`、`./logs/nginx/error.log`
7. Next.js 生产模式通过 `npm run start -- -H 0.0.0.0 -p 3000` 启动。
8. 后台密码来源于环境变量 `ADMIN_PASSWORD`（生产环境必须配置）。
9. 前端仅使用 `NEXT_PUBLIC_*` 变量，未暴露 `ADMIN_PASSWORD` / `DASHSCOPE_API_KEY`。
10. 本 README 已补全首次部署、更新部署、备份建议。

## 2. 关键部署文件

- `Dockerfile`
- `docker-compose.yml`
- `deploy/nginx/default.conf`
- `.env.example`

## 3. 环境变量

复制模板：

```bash
cp .env.example .env
```

至少需要设置：

- `ADMIN_PASSWORD`：后台登录密码（必填）
- `NEXT_PUBLIC_SITE_URL`：站点外网地址（用于 SEO 链接）
- `DASHSCOPE_API_KEY`：启用真实问答时必填
- `DASHSCOPE_MODEL`：默认 `qwen-plus`

说明：

- Compose 中已强制容器数据库路径为 `file:/app/data/dev.db`，对应宿主机 `./data/sqlite/dev.db`。
- `.env` 中的 `DATABASE_URL` 主要用于本地开发脚本。

## 4. 首次部署命令（Linux 服务器）

### 4.1 准备目录

```bash
mkdir -p data/sqlite logs/web logs/nginx
```

### 4.2 准备环境变量

```bash
cp .env.example .env
# 编辑 .env，至少填写 ADMIN_PASSWORD 与 NEXT_PUBLIC_SITE_URL
```

### 4.3 预检查

```bash
docker compose config
```

### 4.4 构建并启动

```bash
docker compose up -d --build
```

### 4.5 初始化样例数据（首次可选）

```bash
docker compose exec web npm run import:docs -- data/sample-docs.json
docker compose exec web npm run seed:admin-config
```

### 4.6 查看状态与日志

```bash
docker compose ps
docker compose logs -f web
docker compose logs -f nginx
```

## 5. 更新版本命令（发布新代码）

```bash
git pull
docker compose build --no-cache web
docker compose up -d web nginx
docker compose logs -f web --tail=200
```

如仅小版本更新，也可使用：

```bash
docker compose up -d --build
```

## 6. 最终上线命令清单（建议顺序）

```bash
# 1) 拉取代码
git clone <your-repo-url> app && cd app

# 2) 准备目录
mkdir -p data/sqlite logs/web logs/nginx

# 3) 配置环境
cp .env.example .env
vi .env

# 4) 检查 compose 配置
docker compose config

# 5) 启动
docker compose up -d --build

# 6) 检查服务
docker compose ps
curl -I http://127.0.0.1

# 7) 初始化样例数据（可选）
docker compose exec web npm run import:docs -- data/sample-docs.json
docker compose exec web npm run seed:admin-config

# 8) 观察日志
docker compose logs -f web
docker compose logs -f nginx
```

## 7. 数据备份建议（SQLite）

### 7.1 最小可行备份（每日）

```bash
cp data/sqlite/dev.db data/sqlite/dev.db.$(date +%F_%H%M%S).bak
```

### 7.2 一致性更好的在线备份（推荐）

```bash
sqlite3 data/sqlite/dev.db ".backup 'data/sqlite/dev.db.$(date +%F_%H%M%S).bak'"
```

### 7.3 备份策略建议

1. 每日增量备份 + 每周全量保留。
2. 最近 7 天每日备份、最近 8 周周备份。
3. 备份文件同步到异机/对象存储（不要只留在单机）。
4. 每月至少做一次恢复演练，验证备份可用。

## 8. 安全与运维注意事项

1. 生产环境必须设置强密码 `ADMIN_PASSWORD`。
2. 不要将 `.env`、数据库备份提交到 Git。
3. 对外建议通过云防火墙仅开放 `80/443`，关闭对外 `3000`。
4. 如启用 HTTPS，请在外层 LB 或 Nginx 追加证书配置。

## 9. 本地开发（补充）

```bash
npm install
npm run setup:local
npm run dev
```

访问：`http://localhost:3000`
