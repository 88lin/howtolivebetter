# 导航栏还原修正

用户反馈「导航栏还是不一样」后，重新对照原站的闭合、滚动、展开和手机状态。之前的首页静态复核没有完整覆盖这些导航状态。

## 差异与修复

- 原站在 `scrollY > 72` 时将宽顶栏收成居中浮动胶囊，本地缺少状态更新。现已接入原站 `is-scrolled` 规则，并在回到顶部时恢复。
- 更多、语言和主题此前使用两列通用弹层，缺少源站图标和选中标记。现改用原站单列菜单、原始 SVG、完整六语言文案和原始链接顺序。
- 补齐中文菜单中的商品清单，保留各语言菜单实际差异；所有导航目标均能在本地路由索引中找到。
- 恢复菜单字体继承：顶栏使用 DM Sans，挂在 body 下的菜单使用原站 Inter 字体栈。
- 菜单定位使用布局尺寸，不受展开时的缩放动画影响；手机菜单向上展开并避开底栏。
- 主题选中标记、音效图标与刷新后的状态保持一致；方向键、Home/End、Escape、外部点击和语言切换可用。

## 验证

`npm run check` 通过，日志位于 `temp/navigation-production-check.log`。生产服务已重新启动在 `http://127.0.0.1:3000`。

`python scripts/verify-navigation.py` 在生产服务通过七组行为检查，页面异常为空；覆盖 390 / 768 / 1440 / 1920 像素宽度、六种语言、真实章节跳转，以及下列原站几何值：

| 状态 | 源站与本地一致的尺寸／位置 |
| --- | --- |
| 1440px 滚动导航 | 1250 × 64px，x=95、y=10 |
| 更多菜单 | 212 × 484px，x=881、y=61 |
| 语言菜单 | 176 × 233.375px，x=1111、y=60 |
| 主题菜单 | 176 × 123.6875px，x=1009、y=59 |
| 390px 手机更多菜单 | 212 × 484px，x=173、y=294 |

完整行为记录：[`navigation-check.json`](navigation-check.json)。原站测量：[`navigation-source-rules.json`](navigation-source-rules.json)、[`navigation-scroll-threshold.json`](navigation-scroll-threshold.json)。

## 视觉对照与独立复核

- [闭合顶栏](../../design-references/howtolivebetter/navigation/comparison-top.jpg)
- [滚动顶栏](../../design-references/howtolivebetter/navigation/comparison-scroll.jpg)
- [更多菜单](../../design-references/howtolivebetter/navigation/comparison-more.jpg)
- [语言菜单](../../design-references/howtolivebetter/navigation/comparison-language.jpg)
- [主题菜单](../../design-references/howtolivebetter/navigation/comparison-theme.jpg)
- [手机菜单](../../design-references/howtolivebetter/navigation/comparison-mobile-more.jpg)

独立完整导航复核判定上述六组画面的几何、字体、材质、配色、结构均为 match；初次返回 `fix` 仅因审阅时读取了尚未更新的设计文档。同步 `DESIGN.md` 和 `.impeccable/design.json` 后，复核者重新读取并判定该项 resolved，最终 disposition: **ship**。此结论只涉及导航栏与菜单，不扩展为所有页面的逐像素验收。

本轮没有重新导入正文。背景中的 677 / 687 条建议差异仍属于内容快照日期差异。
