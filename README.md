# HowToLiveBetter 本地站点

基于 [88lin/ai-website-cloner-template](https://github.com/88lin/ai-website-cloner-template)，将 [高性价比人生指南](https://howtolivebetter.net/) 的公开页面迁移为可编辑的 Next.js 16 / React 19 / TypeScript 项目。内容和视觉基线来自 **2026-10-11** 的原站快照。

当前收录 **4,601 个路由**：539 个页面、工具或账户状态页面，以及六种语言共 4,062 个建议详情页。中文、英语、俄语、西班牙语、日语、越南语各包含 34 章、677 条建议。图片、字体、视频和数据共 235 个本地文件。

## 启动

需要 Node.js 24 或更高版本。在本目录执行：

```powershell
npm ci
npm run dev
```

打开 <http://localhost:3000>。已有依赖时可直接运行 `npm run dev`。

生产方式：

```powershell
npm run check
npm start
```

`npm run check` 依次检查 ESLint、TypeScript 和生产构建。`npm start` 会补齐 standalone 目录中的静态资源，并默认监听 <http://127.0.0.1:3000>。更改代码或内容 JSON 后，需要重新构建再启动生产服务。

自定义端口或数据目录：

```powershell
$env:PORT = '3002'
$env:HOW_LOCAL_DATA_DIR = 'E:\how-data'
npm start
```

数据目录建议使用绝对路径。未设置 `HOW_LOCAL_DATA_DIR` 时，启动脚本会把项目根目录下 `.data` 的绝对路径传给 standalone 服务，避免数据落到构建目录。若直接启动 `.next/standalone/server.js`，需自行设置此变量并准备静态资源。

若需要其他设备访问同一服务器，可设置 `$env:HOSTNAME = '0.0.0.0'`，并通过服务器的局域网地址打开页面。分享链接使用当前浏览器地址；`localhost` 链接只适用于当前电脑。

## 页面与功能

原站的公开路径在本地保持一致，默认中文，其余语言使用 `/en`、`/ru`、`/es`、`/ja`、`/vi` 前缀。

| 原站路径 → 本地同名路径 | 内容与行为 |
| --- | --- |
| `/` | 首页、轮播、菜单、主题、语言切换、视频和常见问题 |
| `/book`、`/book/01` 至 `/book/34`、`/tip/{id}` | 全书、全文检索、筛选、依据、标记、收藏与备注 |
| `/top-50`、`/dashboard`、`/glossary` | 精选、个人清单、进度统计、CSV 导出、分享与术语检索 |
| `/daily`、`/bingo`、`/quiz`、`/checkup` | 每日任务、行动九宫格、避坑测验、人生体检及分享和报告页面 |
| `/meditation`、`/pomodoro`、`/layoff` | 冥想、番茄钟、失业行动包、练习记录与日历导出 |
| `/articles/*`、`/value/*`、`/products`、`/national-day` | 长文、实用选择、商品清单与旅行指南存档 |
| `/sign-in`、`/sign-up`、`/lab`、`/lab/new`、`/together` | 独立的本地账户、清单同步、论坛发帖回复与双人问答 |
| `/about`、`/contact`、`/advertise` 等 | 介绍、联系、广告说明、历史与政策页面 |

完整路径列表在 [routes.json](src/content/howtolivebetter/routes.json)，原站调查和服务边界在 [inventory.md](docs/research/howtolivebetter/inventory.md)。

## 数据保存与原站服务边界

- 未登录时，清单、任务和计时器等记录保存在当前浏览器的 `localStorage`。相同浏览器中，`localhost` 和 `127.0.0.1` 也是不同站点地址，各自保存记录。
- 登录本地账户后，**清单标记、收藏和备注**同步到当前服务器；每日任务、测验和计时器记录仍保存在浏览器。本地账户、论坛和双人问答存放在 `.data/howtolivebetter.sqlite`，可以用 `HOW_LOCAL_DATA_DIR` 指定持久目录。
- 本地账号与原站账号完全独立。微信登录、密码找回邮件、邮箱验证、下载授权、邀请码和原站排行榜没有接入原站后端。相应入口说明了可用范围，并提供原站链接。
- `/book/download` 保留格式介绍，实际 PDF / EPUB / Word 等鉴权下载在原站完成；本地账号不能授予原站下载权限。
- 原站已有账户、私人笔记、私密问答和后台管理数据未迁移。原站公开论坛主题是快照，本地发帖和回复不会发布到原站；举报保存在当前服务器，没有审核通知后台。
- 部分新实现的工具提示和账户文案采用中文或英语回退，原站六种语言的公开正文均保留。
- 内容是固定快照，尚未配置定时同步。书中建议、广告统计和页面日期保留原站当时的值。

当前服务器使用 Node.js 内置 SQLite，适合单个 Node 服务配合可写的持久磁盘。部署到 Vercel 等临时文件系统或多个实例时，需要先更换共享数据库；当前版本未验证这类部署。备份时先停止服务，再复制整个数据目录；不要只复制仍在写入的 SQLite 主文件。`.data/` 已被 Git 忽略。

## 代码与素材位置

| 位置 | 用途 |
| --- | --- |
| `src/app/[[...slug]]/page.tsx` | 按路径读取内容并在服务端渲染；4,601 个页面不是 4,601 份静态构建文件 |
| `src/content/howtolivebetter/pages/` | 页面标题、描述、样式地址和可编辑语义节点；文件名用 `~` 对应路径分隔符 |
| `src/components/sites/howtolivebetter/` | 页面渲染器，以及导航、阅读、工具和本地服务的交互实现 |
| `src/lib/local-store.ts`、`src/app/api/local/` | 独立账户、会话、清单、论坛与问答服务 |
| `public/sites/howtolivebetter/` | 原站图片、字体、视频、CSS 和建议数据 |
| `public/sites/howtolivebetter/videos/` | 当前页面引用的本地视频文件 |
| `docs/research/howtolivebetter/` | 路由、资源映射和验证报告 |
| `docs/design-references/howtolivebetter/` | 原站与本地的桌面、手机截图 |
| `DESIGN.md`、`.impeccable/design.json` | 从最终 CSS 提取的设计 token、主题与响应式规则，以及组件预览 sidecar |

原站生产 JavaScript 仅用于调查，未作为应用代码运行或分发。保留了原书来源、CC BY 4.0 说明和网站原有署名；模板许可不替代原站素材各自的权利。模板原说明在 [docs/TEMPLATE-README.md](docs/TEMPLATE-README.md)。

## 内容与样式维护

页面正文可在 `src/content/howtolivebetter/pages/` 的语义节点 JSON 中修改；阅读器使用 `public/sites/howtolivebetter/tips-{语言}.json` 中的结构化建议数据。页面 JSON 的 `styles` 字段指向原站哈希 CSS，新增本地功能样式集中在 `src/app/globals.css`。视觉约束见 [DESIGN.md](DESIGN.md)。

`scripts/import-site.py`、`import-extra-pages.py` 和提取脚本是本次迁移工具，当前没有经过验证的一键更新流程。HTML 导入与建议提取需要 `beautifulsoup4`（`python -m pip install beautifulsoup4`）。`import-site.py` 优先复用 `temp/source/` 中已有 HTML、已有素材文件也直接复用，并会重写内容与路由索引；单纯重跑不会让缓存内容变成原站最新版。`extract-tips.py` 从该缓存提取建议，仍要求每种语言恰好 677 条；`extract-tool-data.py` 依赖 `temp/tool-reference/` 中对应的参考文件与当时的数据结构。

若以后更新原站内容，应单独准备新快照，核对路由、提取逻辑和本地修改，再替换已确认的数据并复跑下列检查。当前交付保留 2026-10-11 内容，不会随最新截图自动同步。

## 验证

项目构建检查：`npm run check`。

服务启动后，可复跑以下验证。浏览器脚本使用隔离的无头 Chromium，不使用个人浏览器配置。需要 Python 和 Playwright；首次使用安装 `python -m pip install playwright` 与 `python -m playwright install chromium`。

```powershell
python scripts/audit-import.py
python scripts/verify-routes.py
python scripts/verify-reader.py --base-url http://127.0.0.1:3000
python scripts/verify-tools.py
node scripts/verify-services-store.mjs
python scripts/verify-services.py
python scripts/verify-visual.py
python scripts/verify-navigation.py
python scripts/capture-full-pages.py --local-only
```

`verify-routes.py` 默认检查全部 4,601 条路径的 HTTP 状态和标题，`--scope sitemap` 只检查原站站点地图的 417 页。服务测试创建并清理专用测试账户；如果启动服务时设置了 `HOW_LOCAL_DATA_DIR`，测试也应使用同一变量。

以上浏览器和 HTTP 检查默认使用 `http://127.0.0.1:3000`。自定义端口时，路由与阅读检查用 `--base-url`，工具检查用 `TOOL_TEST_BASE`，服务检查用 `HOW_TEST_BASE_URL`。`verify-visual.py` 与 `capture-full-pages.py` 当前固定使用 3000 端口；运行它们时请在该端口启动待检查站点。

最近一次验证范围、证据和已知差异见 [交付记录](docs/research/howtolivebetter/delivery.md)。
