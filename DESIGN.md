---
name: HowToLiveBetter
description: 原站森林绿与奶油纸面上的阅读、清单和生活工具视觉系统。
colors:
  deep: "#12382d"
  ink: "#18372d"
  moss: "#245345"
  lime: "#d5ed9e"
  coral: "#eb866d"
  paper: "#f7f7f0"
  white: "#fff"
  line: "#dce4d5"
  reading-muted: "#53655a"
  hero-text: "#f7f6e9"
  button-ink: "#1b3e2e"
  advice-paper: "#faf8ee"
  night-paper: "#171b19"
  night-deep: "#141815"
  night-ink: "#e7e8e2"
  night-surface: "#202622"
  night-raised: "#29312b"
  night-selected: "#344335"
  night-line: "#3c473f"
  night-moss: "#abc1a3"
  night-lime: "#c5d3ae"
  night-muted: "#b5bdb3"
typography:
  display:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "clamp(49px, 5.2vw, 78px)"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.085em"
  display-en:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "clamp(43px, 4.35vw, 66px)"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.065em"
  headline:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "clamp(35px, 3.5vw, 54px)"
    lineHeight: 1.26
    letterSpacing: "-0.06em"
  reader-title:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "21px"
    lineHeight: 1.55
    letterSpacing: "-0.045em"
  body:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "16px"
    lineHeight: 1.8
  label:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.18em"
  navigation:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "13px"
    fontWeight: 500
  button:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "14px"
    fontWeight: 600
  advice-title:
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "clamp(21px, 1.8vw, 24px)"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.025em"
rounded:
  control: "10px"
  card: "12px"
  action: "16px"
  overlay: "18px"
  feature: "24px"
  chip: "50px"
  capsule: "999px"
spacing:
  compact: "8px"
  regular: "16px"
  roomy: "24px"
  wide: "32px"
  desktop-gutter: "48px"
  section: "116px"
  mobile-section: "75px"
components:
  button-lime:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.button-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.action}"
    padding: "17px 25px"
  button-dark:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.action}"
    padding: "17px 25px"
  button-ghost:
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.action}"
    padding: "17px 25px"
  search:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 19px"
    height: "62px"
  navigation-link:
    typography: "{typography.navigation}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  filter-chip:
    backgroundColor: "{colors.white}"
    textColor: "#526650"
    rounded: "{rounded.chip}"
    padding: "9px 14px"
  filter-chip-selected:
    backgroundColor: "#245841"
    textColor: "{colors.white}"
    rounded: "{rounded.chip}"
    padding: "9px 14px"
  reader-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "27px 32px"
  advice-card-copy:
    backgroundColor: "{colors.advice-paper}"
    textColor: "#193e31"
    typography: "{typography.advice-title}"
    rounded: "{rounded.action}"
    padding: "23px 28px 22px"
---

# Design System: HowToLiveBetter

## Overview

**Creative North Star: "原站的森林绿生活指南"**

本轮为完整还原：2026-10-11 原站公开页面是内容和视觉权威，`docs/design-references/howtolivebetter/` 保存原站与本地截图。这里将本轮已有的原站视觉约束合并为源码可验证的规则；名称只描述现有视觉，不建立新的设计方向。2026-10-12 补采的桌面图及其内容差异见交付记录。

页面模式是阅读与生活工具操作。深森林绿首屏、奶油纸面、浅黄绿色动作按钮与真实章节插图构成主要识别。密集的阅读与清单区域保留原站标题、标签、卡片和控件关系；导航、卡片轮播、页脚、明暗主题与手机版底部导航均继承原站。新增本地状态沿用相同色彩与控件尺度。

**Key Characteristics:**

- 森林绿承载首屏与主要行动，奶油纸面承载阅读。
- 本地 DM Sans 配合原站各语言的系统字体回退，插图与 SVG 均使用原素材。
- 阅读内容清楚分层，轻阴影和柔和圆角服务于卡片、控件与浮层。
- 响应式导航、阅读侧栏和主题变化以原始 CSS 的最终级联为准。

证据入口：`public/sites/howtolivebetter/styles/87b4bd0c0c16df42.css`（首页），`20cef0d5f6369cde.css`（全书），`ddbf0c2e703eee8c.css`（章节），以及 `src/app/globals.css`（本地功能补充）。页面 JSON 的 `styles` 字段决定所用文件。同一 CSS 内容按哈希只保存一份；各路由样式有共同规则，也有页面差异。此文档记录可复用的最终规则，不代替完整 CSS。

## Colors

整体是低饱和绿与温暖浅纸色；前景、边线、选中态都与所在主题一起变化。

### Primary

- **Deep / 森林深绿**：首页 hero、深色动作按钮和页脚的主承载面。
- **Moss / 苔绿**：次级强调与当前最终键盘焦点色。
- **Lime / 浅黄绿**：深底上的主行动、强调字和小型状态亮点。

### Secondary

- **Coral / 珊瑚色**：原站次级强调变量，保留源站用途，不扩展为新的全局主色。

### Neutral

- **Paper / 奶油纸** 与 **White / 白卡面**：区分页面底和阅读、输入区域。
- **Ink / 绿墨**、**Reading muted / 阅读辅助文字** 与 **Line / 浅绿边线**：分别用于主要文字、辅助说明和区域分隔。
- **Hero text / 首屏浅字** 与 **Advice paper / 建议纸卡**：保留深色首屏内的局部色差。
- **Night 系列**：暗色页面使用 night-paper，浮面使用 night-surface，抬高与选中状态使用 night-raised / night-selected。夜间前景、辅助字、边线、苔绿和浅黄绿各自有对应值；不能只反转背景。

**The Source Palette Rule.** 使用原站语义变量及其主题覆盖；不要用模板基础主题的 `--primary` 或通用 Tailwind 颜色替换森林绿系统。

`src/app/globals.css` 中的本地对话框和提示目前有独立固定色与 `--background` / `--foreground` 回退。导航菜单使用原站 `.life-more-menu` / `.life-theme-menu` 的颜色，不再使用通用本地弹层。

## Typography

**Display / Body Font:** DM Sans，配合前置系统字体及中文字体回退，完整栈见 frontmatter。日语改用 Hiragino Sans、Hiragino Kaku Gothic ProN、Yu Gothic、Noto Sans JP / CJK JP 回退。文件保存在 `public/sites/howtolivebetter/fonts/`。

源 CSS 的底层 `:root` 还声明 Inter Variable 与 Libre Baskerville；实际站点外层是 `.life-site`，它覆盖为 `--life-font`。因此不能把底层字体声明当作首页、书籍和工具页的统一最终字体。标题并非全站衬线：中文首屏局部 `em` 使用 Songti SC / Noto Serif SC，统计数字保留 Georgia；英文首屏强调字回到 DM Sans。

导航菜单是例外：原站把菜单挂在 `body` 下，实测字体为 `"Inter Variable", Inter, sans-serif, -apple-system, "system-ui", "Segoe UI", Helvetica, Arial, sans-serif`。本地保持这一继承边界，导航栏本身仍使用 `.life-site` 的 DM Sans 字体栈。

### Hierarchy

- **Display**：中文首屏主标题，字号、紧字距与行高见 token；900px 以下改为 `clamp(46px, 8vw, 68px)`，540px 以下为 42px。英文另有 display-en，540px 以下为 41px。
- **Headline**：首页通用区块标题；540px 以下为 37px。推广面板另有自己的较小标题，不机械套用通用标题。
- **Reader title**：建议卡标题，540px 以下为 18px。未显式指定字重的标题继续继承源码，不统一强制加粗。
- **Body**：建议摘要与展开依据的最终正文为 16px / 1.8；不要误采较早的 12–13px 声明。首屏介绍仍为 17px / 2，900px 以下为 14px；正文角色并非强制覆盖所有说明文字。
- **Label**：原站已有小标签采用紧凑字号；中文和日语将字距缩为 `0.04em`。它们是原站布局的一部分，不新增空泛的装饰标签。
- **Navigation / Button**：导航最终字重 500，动作按钮最终字重 600；响应式和滚动状态另有 12px 导航样式。
- **Advice title**：首屏轮播纸卡标题；540px 以下为 22px。

**The Cascade Rule.** 提取 token 时读到源 CSS 最后的覆盖层，并同时检查媒体查询、语言与主题；不要把早期声明当作最终值。

## Layout

桌面公共内容最大宽度为 1500px。首页通用区块两侧留 48px、上下 116px；900px 以下改为两侧 24px、上下 75px。局部推广模块有自己的宽度、间距与圆角，不展开成全站规则。

首页首屏为约 1.06 : 0.94 的两栏，间距 50px，900px 以下单栏；540px 以下左右留 20px。章节卡网格从三栏变为 900px 以下两栏。保留真实插图比例、裁切和原站卡片次序，不用占位图填充。

阅读页为 302px 目录侧栏加弹性正文，正文两侧使用 `min(7vw, 115px)`。900px 以下改为纵向流，正文两侧 24px，目录主体折叠。章节卡内边距从 `27px 32px` 在 540px 以下变为 21px。

顶栏固定且滚动后收成浮动胶囊。默认占位高 76px；1120px 以下导航换行时为 108px；760px 以下恢复 76px，并隐藏桌面导航、显示五项底栏。底栏使用 safe-area inset，单项最小高度 52px。锚点与粘性侧栏使用 88px / 112px / 84px 的头部避让值，不能单独删去顶栏占位。

**The Responsive Source Rule.** 保留源站 540、600、760、900、1120px 等实际断点；不要将不同页面强行统一到框架默认断点。

## Elevation & Depth

主要内容使用浅色分层、细线和轻软阴影；按钮、卡片与导航浮面有独立状态。源站书封、拼贴和纸卡中也存在偏移纸层，这些是本次还原的固定视觉，不能被一般设计偏好清除，也不自动推广到新增表单。

### Shadow Vocabulary

- **UI resting**：`0 1px 2px #12382d0a, 0 6px 20px #12382d0a`，卡片配合顶部浅边使用。
- **UI raised**：`0 2px 4px #12382d0d, 0 10px 28px #12382d14`，精细指针悬停和抬高区域使用。
- **Night resting / raised**：使用原站深色阴影变量，完整值在 sidecar，避免沿用亮色边光。
- **Advice deck**：`0 24px 65px #051b2440`，首屏纸卡前层；后方两张色纸旋转约 ±4°。
- **Navigation menu**：`0 0 0 1px #12382d08, 0 4px 8px #12382d0d, 0 16px 40px #12382d1f`，来自原站菜单最终覆盖。

**The Source Material Rule.** 原站插图、纸层、标签与图标是还原约束；保持其原有用途，不按通用审美规则替换，也不无证据地延伸到其他组件。

常用缓动是 `cubic-bezier(.22, 1, .36, 1)`。按钮过渡为 0.3s，细小控件约 0.18–0.2s，卡片约 0.22s，首屏轮播约 0.4s。精细指针悬停时按钮上移 1px、普通卡片上移 2px；动作按钮按下的最终覆盖为缩放 0.98。`prefers-reduced-motion` 取消相关过渡和位移，且本地全局样式取消平滑滚动。

## Shapes

主要动作采用柔和的 16px 圆角，输入和导航使用 10px，阅读卡使用 12px，浮层常见 18px，大型推广面板使用 24px。筛选标签仍保留 50px 胶囊，滚动顶栏使用 999px 胶囊；不要把早期 `.life-button` 的 50px 当作其最终圆角。

细边线划分阅读条目、标签与输入区域，插图按原站比例裁切。SVG 是实际线性图标；原站已有字符或数字标记按原页面保留，不另造一套替代图标。

## Components

### Buttons

主按钮稳重而易识别。Lime 用于深底主要行动，Dark 用于浅底行动，Ghost 用于深底次级入口，Ghost 保留 `1px solid #719280` 边线。标准内边距见 token，540px 以下为 `14px 19px`。焦点最终采用 2px Moss 外框、外偏移 3px；首屏轮播有自己的可见焦点覆盖。状态过渡与按下缩放见 Elevation & Depth。

### Chips

清单筛选使用白底细边胶囊与深绿选中胶囊，字为 11px / 700。切换改变色与边线，计数继承同一标签。正文中的依据标签和清单完成状态是各自语义组件，不与导航 active 状态互换。

### Cards / Containers

阅读卡为白底、浅绿细边和轻阴影，内含标题、摘要、成本收益、依据、操作和备注。实际正文与按钮尺度以 Typography 为准。首屏章节轮播为暖纸卡和后方旋转纸层，插图比例 3:2，内容切换保留可访问性状态与原站文案；sidecar 只演示其文字区，不复制轮播运行逻辑。

### Inputs / Fields

全书检索为白底、62px 高、10px 圆角的输入容器，横向内边距 19px，输入字号 15px。聚焦容器改用 Moss 边线和 3px、12% Moss 外晕；检索占位文字采用阅读辅助色。新增本地对话框输入的 6px 圆角、10px 内边距是已有局部样式，不覆盖全书检索。

### Navigation

桌面导航文字继承当前顶栏颜色，默认不透明度 0.76，悬停和 active 恢复 1；浅底状态背景为 `#e9eee0`，深底为 `#285445`。最终链接圆角 10px、字重 500；滚动、窄桌面与手机状态保留各自内边距。手机五项底栏、菜单、主题与语言入口使用原结构和 SVG。

`scrollY > 72` 时启用原站 `is-scrolled` 样式，回到阈值内恢复完整宽栏。1440px 下浮动导航为 1250 × 64px，顶部偏移 10px。更多菜单单列，最小宽 212px；主题与语言菜单最小宽 176px，圆角 14px。桌面菜单位于按钮下方 4px；手机更多菜单位于底栏按钮上方 10px，并与屏幕边缘至少留 5px。菜单位置使用未受展开缩放动画影响的布局尺寸。

### Local service overlays

`src/app/globals.css` 中本地对话框宽度是 `min(520px, calc(100vw - 32px))`、最大高度 85dvh、内边距 28px、圆角 18px；toast 在底部 90px。它们支持本地账户与工具交互，样式单独维护，不能将服务实现细节写进原站公开正文。导航菜单按上节维护，不继承本地对话框的近似样式。

## Do's and Don'ts

### Do:

- **Do** 保留原站真实文字、插图、SVG、视频、字体、章节卡片、导航与页脚结构。
- **Do** 同时验证最终 CSS 的主题、语言和断点覆盖，再记录或复用 token。
- **Do** 用原站浅纸、绿墨、苔绿、浅黄绿及其暗色对应值维护状态层级。
- **Do** 为阅读保留 16px / 1.8 的最终正文尺度、键盘焦点与减少动态效果设置。
- **Do** 在原始哈希 CSS 之外集中维护新增本地样式，并在视觉改动后对照保存的参考图。

### Don't:

- **Don't** 在完整还原阶段替换视觉方向、重绘原图或以通用模板控件改造现有页面。
- **Don't** 把基础 Inter / Libre Baskerville、早期按钮胶囊或旧正文小字号误写成最终站点规范。
- **Don't** 因通用风格偏好删除原站固有标签、纸层或图标，也不要将局部装饰推广到每个新组件。
- **Don't** 把本地服务样式的近似色扩展为新的全局品牌色，或声称所有路由均经过逐像素验证。

已知差异不作为新规范：本地服务浮层仍有独立固定色与字体继承边界；原站动态广告、视频帧及 2026-10-12 更新后的下载数字与内容快照有差异。此文档保留这些实际边界，未修改源码来统一它们。设计 sidecar 的色阶仅供面板展示，非原站新增配色要求。
