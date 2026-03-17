import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

const prisma = new PrismaClient({
  log: ["warn", "error"]
});

const defaultConfigs: Array<{ configKey: string; configValue: string }> = [
  {
    configKey: "site.name",
    configValue: "工程造价规范检索助手"
  },
  {
    configKey: "qa.riskNotice",
    configValue: "仅供参考，具体仍需结合合同、补充协议和项目资料判断。"
  },
  {
    configKey: "trial.primaryIntent",
    configValue: "内部试用,本地部署,项目资料专项分析"
  },
  {
    configKey: "search.defaultCategory",
    configValue: "all"
  },
  {
    configKey: "qa.retrievalTopK",
    configValue: "6"
  }
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const item of defaultConfigs) {
    const exists = await prisma.adminConfig.findUnique({
      where: { configKey: item.configKey },
      select: { id: true }
    });

    await prisma.adminConfig.upsert({
      where: { configKey: item.configKey },
      update: { configValue: item.configValue },
      create: {
        configKey: item.configKey,
        configValue: item.configValue
      }
    });

    if (exists) {
      updated += 1;
      console.log(`[seed-admin-config] 更新 ${item.configKey}`);
    } else {
      created += 1;
      console.log(`[seed-admin-config] 新建 ${item.configKey}`);
    }
  }

  console.log(`[seed-admin-config] 完成。新建 ${created}，更新 ${updated}`);
}

main()
  .catch((error) => {
    console.error("[seed-admin-config] 执行失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
