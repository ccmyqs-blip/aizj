# Design Tokens v1 (Desktop Web)

- Project: 工程造价规范检索助手
- Token Type: 语义化设计契约（用于 Figma + 前端映射）
- Version: 1.0.0
- Date: 2026-03-17

## 1. Token 命名契约

## 1.1 前缀规范

1. `color.*`: 颜色。
2. `font.*`: 字体家族。
3. `text.*`: 字号/行高/字重。
4. `space.*`: 间距。
5. `radius.*`: 圆角。
6. `shadow.*`: 阴影。
7. `stroke.*`: 边框。
8. `motion.*`: 动效时长/曲线。

## 1.2 语义优先规则

1. 先使用语义 token（如 `color.surface.panel`），不直接用原始色值。
2. 组件状态必须使用状态 token（如 `color.state.error.bg`）。
3. 页面级样式禁止绕过 token 直接写临时值。

## 2. 颜色系统

## 2.1 Brand & Neutrals

```yaml
color.brand.900: "#0B2E4F"
color.brand.800: "#15466F"
color.brand.700: "#1E5F90"
color.brand.600: "#2A76AC"
color.brand.500: "#3B8CC2"

color.accent.teal.600: "#0E7C74"
color.accent.teal.500: "#17968C"

color.neutral.950: "#0F1726"
color.neutral.900: "#1D2939"
color.neutral.700: "#475467"
color.neutral.500: "#667085"
color.neutral.300: "#D0D5DD"
color.neutral.200: "#E4E7EC"
color.neutral.100: "#F2F4F7"
color.neutral.50:  "#F8FAFC"
color.white:       "#FFFFFF"
```

## 2.2 Functional Colors

```yaml
color.state.success.fg: "#067647"
color.state.success.bg: "#ECFDF3"
color.state.warning.fg: "#B54708"
color.state.warning.bg: "#FFFAEB"
color.state.error.fg:   "#B42318"
color.state.error.bg:   "#FEF3F2"
color.state.info.fg:    "#175CD3"
color.state.info.bg:    "#EFF8FF"
```

## 2.3 Surface & Border

```yaml
color.surface.page:      "#F6F8FB"
color.surface.panel:     "#FFFFFF"
color.surface.muted:     "#F8FAFC"
color.surface.highlight: "#EEF6FF"

stroke.default: "#D0D5DD"
stroke.strong:  "#98A2B3"
stroke.focus:   "#2A76AC"
```

## 3. Typography

## 3.1 Font Family

```yaml
font.display: "'IBM Plex Sans', 'Noto Sans SC', sans-serif"
font.body:    "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif"
font.mono:    "'JetBrains Mono', 'SFMono-Regular', monospace"
```

## 3.2 Text Styles

```yaml
text.display.lg: { size: 40, line: 52, weight: 700 }
text.display.md: { size: 32, line: 42, weight: 700 }
text.h1:         { size: 28, line: 38, weight: 700 }
text.h2:         { size: 22, line: 32, weight: 600 }
text.h3:         { size: 18, line: 28, weight: 600 }
text.body.lg:    { size: 16, line: 28, weight: 400 }
text.body.md:    { size: 14, line: 24, weight: 400 }
text.body.sm:    { size: 13, line: 20, weight: 400 }
text.label.md:   { size: 14, line: 20, weight: 500 }
text.label.sm:   { size: 12, line: 18, weight: 500 }
```

## 4. Spacing / Radius / Shadow

## 4.1 Spacing Scale

```yaml
space.0: 0
space.1: 4
space.2: 8
space.3: 12
space.4: 16
space.5: 20
space.6: 24
space.8: 32
space.10: 40
space.12: 48
space.16: 64
```

## 4.2 Radius

```yaml
radius.sm: 8
radius.md: 12
radius.lg: 16
radius.xl: 20
radius.pill: 999
```

## 4.3 Shadow

```yaml
shadow.sm: "0 1px 2px rgba(16,24,40,.06)"
shadow.md: "0 6px 18px rgba(11,46,79,.10)"
shadow.lg: "0 12px 32px rgba(11,46,79,.14)"
```

## 5. Component Token Contract

## 5.1 Button

```yaml
button.primary:
  bg: color.brand.700
  fg: color.white
  hoverBg: color.brand.800
  focusRing: stroke.focus
  disabledBg: color.neutral.300
  disabledFg: color.neutral.500

button.secondary:
  bg: color.white
  fg: color.brand.800
  border: stroke.default
  hoverBg: color.surface.highlight

button.tertiary:
  bg: transparent
  fg: color.brand.700
  hoverFg: color.brand.900
```

## 5.2 Input / Select / Textarea

```yaml
field.bg: color.white
field.border: stroke.default
field.hoverBorder: stroke.strong
field.focusBorder: stroke.focus
field.placeholder: color.neutral.500
field.text: color.neutral.900
field.errorBorder: color.state.error.fg
field.successBorder: color.state.success.fg
```

## 5.3 Card

```yaml
card.default:
  bg: color.surface.panel
  border: stroke.default
  radius: radius.lg
  shadow: shadow.sm

card.result:
  tagCodeBg: color.surface.highlight
  tagCodeFg: color.brand.800
  tagCategoryBg: color.neutral.100
  tagCategoryFg: color.neutral.700
```

## 5.4 Alert

```yaml
alert.info:    { bg: color.state.info.bg,    fg: color.state.info.fg }
alert.warning: { bg: color.state.warning.bg, fg: color.state.warning.fg }
alert.error:   { bg: color.state.error.bg,   fg: color.state.error.fg }
alert.success: { bg: color.state.success.bg, fg: color.state.success.fg }
```

## 6. 状态矩阵（Default / Hover / Focus / Loading / Empty / Error / Success）

## 6.1 Search

1. `default`: 输入可编辑，结果列表正常展示。
2. `hover`: 结果卡边框和阴影增强。
3. `focus`: 输入框显示 `stroke.focus` + 外环。
4. `loading`: 结果区显示加载占位与“正在检索”。
5. `empty`: 显示无结果提示 + 三条建议。
6. `error`: 显示错误 Alert，提供重试指引。
7. `success`: 有结果时统计条高亮显示总数。

## 6.2 QA

1. `default`: 文本域可输入，建议问题可点击。
2. `hover`: 建议 chip 描边加深。
3. `focus`: 文本域 focus ring 强化。
4. `loading`: 提交按钮与回答区均显示加载语义。
5. `empty`: 未提交前展示引导文本。
6. `error`: 回答区显示错误消息。
7. `success`: 展示回答、模型信息与引用列表。

## 6.3 Trial

1. `default`: 表单字段默认边框。
2. `hover`: 可交互字段边框微增强。
3. `focus`: 当前字段高亮 focus ring。
4. `loading`: 提交按钮进入 loading。
5. `empty`: 必填字段为空时提示。
6. `error`: 提交失败显示 error Alert。
7. `success`: 提交成功显示 success Alert。

## 7. Figma 对齐规则

1. 颜色、字号、阴影全部创建为 Variables/Styles。
2. 组件属性使用 Variants 管理状态，不建重复组件。
3. 命名遵循 `category/semantic/level`，与本文件一一对应。
4. 前端映射时，优先落 `globals.css` 变量与 Tailwind `theme.extend` 语义键。
