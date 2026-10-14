# 本地迁移交付记录

验证日期：2026-10-12（Asia/Shanghai）。内容快照与手机截图基线：2026-10-11。桌面全页截图在 2026-10-12 使用独立的桌面浏览器上下文重新采集；未重新导入正文，也未使用个人浏览器配置。

## 范围与实现

- 4,601 个同路径本地页面：539 个正文、工具和账户状态页面，以及 4,062 个独立建议页。
- 六种语言各 34 章、677 条建议。中文 776 个路由，其余五种语言各 765 个路由；这些数量包含辅助页面，不表示所有页面都提供同等后台能力。
- 235 个本地素材和数据文件，约 76.6 MiB。静态审计检查了正文、样式中的 221 个唯一引用资源和 4,513 个唯一站内链接，无缺失。
- Next.js 的可选 catch-all 路由读取语义节点 JSON，使用 React 服务端渲染；交互由本站 TypeScript 实现。未执行原站生产 JavaScript。
- 本地账户、清单同步、论坛和双人问答使用独立 SQLite 服务；原站授权服务按下文边界处理。

完整源路径到本地路径映射：[`routes.json`](../../../src/content/howtolivebetter/routes.json)。每项含 `path`、`title`、`file` 和 `lang`；原站与本地使用相同 `path`。资源来源见 [`asset-map.json`](asset-map.json) 和 [`external-asset-map.json`](external-asset-map.json)。

## 本次补修

1. 补通直接访问 `/sign-up` 的本地注册，以及 `/lab/new` 的本地发帖；保留登录回跳和已有清单导入。
2. 密码找回、重置、邮箱验证、微信登录、昵称、登录回调和邀请码页不再无限加载，改为说明服务边界并提供本地入口及原站入口。
3. 广告周期按钮更新选择状态、文字和联系链接；关闭广告按钮可隐藏当前广告。
4. 全路由验证由站点地图的 417 页扩展至全部 4,601 页，并核对页面标题。复用 HTTP 连接，避免 Windows 临时端口耗尽。
5. 修正视觉验证输出的 UTF-8 编码；资源、路由和视觉检查在发现问题时返回失败状态。全页截图支持 `--local-only`，可保留原站基线。
6. 补齐根目录 README：启动方式、文件归属、数据持久化、验证命令与原站服务边界。原模板说明保存在 `docs/TEMPLATE-README.md`。
7. 将本轮已有的原站视觉约束合并为 [`DESIGN.md`](../../../DESIGN.md) 中的实际 token，并增加 [`.impeccable/design.json`](../../../.impeccable/design.json) 组件预览。提取以原 CSS 的最终级联、语言、主题与断点为准，没有更换视觉方向。

## 实际验证

| 检查 | 本次结果与证据 |
| --- | --- |
| `npm run check` | ESLint、TypeScript 和生产构建通过。Node 内置 SQLite 仅有 experimental 提示，没有构建失败。 |
| `npm start` | standalone 生产服务启动成功；产物内有全部 4,601 个页面 JSON，并可加载 public 和构建静态文件。 |
| `python scripts/audit-import.py` | 0 个缺失路由、0 个缺失资源；见 [`route-audit.json`](route-audit.json)。 |
| `python scripts/verify-routes.py` | 4,601 / 4,601 返回 HTTP 200 且标题符合内容索引；见 [`route-http-check.json`](route-http-check.json)。此项检查响应与标题，不代表每页均做过视觉审阅。 |
| `python scripts/verify-reader.py --base-url http://127.0.0.1:3000` | 标记互斥、收藏、依据链接、备注、刷新保留、清单评分、CSV、搜索与筛选、精选分享、术语检索和跨语言记录通过；终端记录 6 组 PASS，页面异常为空。`reader-check.json` 保留上次较详细记录，此脚本不覆盖该文件。 |
| `python scripts/verify-tools.py` | 任务、九宫格与分享、测验、本人和父母体检、家庭计划与日历、冥想、番茄钟、失业行动包、英语恢复和 7 个手机工具页通过；见 [`tool-check.json`](tool-check.json)。 |
| `node scripts/verify-services-store.mjs` | 会话和密码散列、来源检查、账户数据隔离、论坛写入、双人容量、草稿私密性、双向提交揭晓、不可改写已提交答案、删除和退出通过。 |
| `python scripts/verify-services.py` | 补修后的辅助账户页、直接注册和发帖、清单同步、回复与感谢、双浏览器问答、延迟响应竞争、跨设备恢复和退出前保存通过；见 [`service-check.json`](service-check.json)。 |
| `python scripts/verify-visual.py` | 首页 390 / 768 / 1440 / 1920 像素宽度；12 个代表页面及广告选择交互通过。无脚本或控制台错误、失败 HTTP 资源、缺图与横向溢出；见 [`visual-check.json`](visual-check.json)。 |

浏览器测试使用临时无头 Chromium。服务流程测试使用 `temp/qa-resume-20261012` 中的独立数据库，并清理测试账户，未使用用户正常数据目录。

## 视觉证据与限制

后续用户反馈导航不一致，确认旧复核未完整覆盖展开菜单和滚动状态。现已修复浮动导航、菜单样式与图标，并在生产服务通过专项检查；本轮导航验收以 [`navigation-fix.md`](navigation-fix.md) 为准。

最终独立复核结论为 **`ship`**，无重大修复项；审阅覆盖完整首页的 16 张桌面／手机分段对照，并结合主要实现与验证记录抽样。初次长图审阅超出工具大小限制后，已用压缩分段图交由新的独立审阅者重新完成全轮复核。详细判定见 [`finish-review.md`](finish-review.md)。

原站在左、本地在右：

- [桌面首屏对照](../../design-references/howtolivebetter/desktop-comparison.png)，1440 × 1000。
- [手机首屏对照](../../design-references/howtolivebetter/mobile-comparison.png)，390 × 844。
- [首页中段对照](../../design-references/howtolivebetter/section-comparison.png)。

完整页面截图：[`source-desktop.png`](../../design-references/howtolivebetter/source-desktop.png)、[`local-desktop.png`](../../design-references/howtolivebetter/local-desktop.png)、[`source-mobile-full.png`](../../design-references/howtolivebetter/source-mobile-full.png)、[`local-mobile-full.png`](../../design-references/howtolivebetter/local-mobile-full.png)。

全页截图强制绘制浏览器延迟渲染的屏外内容，避免长截图误呈空白。每个尺寸使用独立上下文，加载字体、解码图片并逐段滚动后再截图，避免从手机切换到桌面时遗漏图片绘制。可用 `python scripts/capture-full-pages.py --viewport desktop` 只更新桌面截图，保留手机基线；加上 `--local-only` 可仅更新本地截图。已对照首页首屏及长页区块；视频帧和播放时序不作为静态像素一致性依据。没有逐一对 4,601 页作像素级审阅。

本次长页对照仍有小幅差异：桌面总高为原站 12,425、本地 12,423 像素，手机为原站 17,554、本地 17,570 像素；顶部社区广告的文案样本不同，视频控制条和动态卡片的采样状态也有差别。10 月 12 日重新截图时，原站下载区已更新为 687 条建议、729 页 PDF，本地保留 10 月 11 日的 677 条建议、717 页 PDF 文案。桌面首屏与手机对照图仍为原快照基线；最新完整桌面图用于核对绘制和布局，不表示正文已同步到原站最新版本。首屏主要排版、图像和正文结构已对照，不将全站描述为逐像素完全一致。

## 服务边界

2026-10-14 更新：已删除原快照中的全部 13,341 个广告组件实例，移除六种语言的广告招租与合作品牌推广页。下列视觉验证记录来自清理前构建，仅作为历史迁移证据，不代表当前页面仍展示广告。

- 原站微信、验证邮件、密码找回、下载鉴权、邀请码和排行榜未接入；相应页面提供说明或原站入口。
- 未迁移原站已有账户、私人记录或管理后台数据。原站公开论坛主题保留快照，本地新增主题、回复与问答仅存当前服务器。
- 本地举报只记录到数据库，没有审核通知或管理后台；原站审核链接维持无效或过期的公开状态。
- 离线书籍鉴权下载在原站完成。本地账号不提供原站权限，也未绕过授权下载文件。
- 日常工具记录仍在浏览器，只有清单标记、收藏、备注，以及论坛和双人问答使用本地账户服务。
- 部分新实现的工具、菜单和账户提示使用中文或英语回退。公开正文保留六种语言；部分原站页面本身保留中文正文。
- SQLite 需要单实例和持久可写目录。Vercel、多实例部署、外部数据库、自动内容同步和真实邮件服务均未配置或验证。

## 运行与维护

在项目根目录运行 `npm run dev`；生产模式先 `npm run check` 再 `npm start`。默认生产地址 `http://127.0.0.1:3000`；启动脚本把项目根目录 `.data/` 的绝对路径传给 standalone 服务。自定义 `HOW_LOCAL_DATA_DIR` 时也建议使用绝对路径和持久可写磁盘，停服后备份整个目录。

页面、结构化建议和样式的编辑位置、各测试脚本的端口参数见 [`README.md`](../../../README.md)。导入脚本会复用 `temp/source/` 缓存及已有素材，建议提取仍固定校验每种语言 677 条；当前没有验证过的一键内容刷新流程。更新内容时需要先准备新快照并核对提取逻辑，不能把重新截图视为正文已同步。

本次工作仅保存在当前工作区，未执行 Git 提交、推送或远程部署。
