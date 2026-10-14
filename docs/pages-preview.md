# GitHub Pages 前端预览

地址：<https://88lin.github.io/howtolivebetter/>。Pages 负责静态前端预览；需要 SQLite、会话与写入 API 的完整版本仍运行在 Node.js 服务器上。

## 发布

仓库 Settings → Pages 使用 **GitHub Actions**。`.github/workflows/pages-preview.yml` 在 `master` 推送、手动运行或 `Sync Chinese book` 成功结束后发布。同步机器人提交不触发普通 push 工作流，因此需要额外的 `workflow_run` 入口；部署始终检出最新的 `master`。部署并发受同一个 concurrency group 约束。

工作流安装依赖、检查源码、构建静态站点、验证浏览器交互，再上传 `.tmp/pages-preview/out` 并部署。构建或检查失败时不覆盖上一份预览。

## 本地构建与检查

```powershell
npm run build:pages
python scripts/verify-pages-preview.py
```

需要 Node.js 24+；浏览器检查还需要 Python、`playwright` 包与 Chromium：`python -m pip install playwright`、`python -m playwright install chromium`。测试自动启动临时静态服务器，将导出目录映射到真实子路径，并在结束时关闭服务器和隔离浏览器。

`PAGES_BASE_PATH` 默认 `/howtolivebetter`，可以改成其他无尾斜杠的子路径或空字符串。构建期间注入 `NEXT_PUBLIC_SITE_BASE_PATH` 与 `NEXT_PUBLIC_STATIC_PREVIEW`，统一处理正文、导航、动态链接、图片、字体和 CSS 的根路径。普通 `npm run build` 不使用这些预览变量。

构建脚本在带所有权标记的 `.tmp/pages-preview` 中复制应用，排除 API 路由和 SQLite 模块。仅在这份副本中启用静态导出与 `generateStaticParams`；不移动或删除原项目路由。导出为每个公开路径生成独立 `index.html`，保留真正的 404。预览页面带 `noindex`。

## 体积与导航约束

本项目所有站内跳转采用普通 HTML 链接，每次加载完整文档。Next.js 的页面内嵌数据和 JavaScript 仍负责 hydration 与交互；额外的客户端导航 Flight 文本不参与该模式。

2026-10-14 构建包含 4,623 个页面。完整导出约 1.15 GiB，其中约 670.5 MiB 是单独的客户端路由数据。脚本检查所有页面仍含内嵌 hydration 数据后，删除生成的 `index.txt` 和 `__next.*` 路由数据，保留 HTML、脚本和全部公共素材；发布体积约 504.3 MiB。超过 950 MiB 时停止发布，预留 GitHub Pages 容量余量。

构建会检查源码导入，禁止引入 `next/link`、`next/router` 或客户端 `next/navigation`；服务端 `notFound` 允许使用。如果以后需要 Next 客户端路由，必须先调整发布策略并保留其所需数据，不能简单移除检查。浏览器验证覆盖实际点击、直接深层链接、刷新、后退，并检查没有 Flight 请求或丢失资源。

## 预览功能范围

- 全部六种语言页面、搜索、主题、菜单与普通页面导航可用。
- 阅读标记、收藏、备注及工具记录保存在当前浏览器的 `localStorage`。清除浏览器站点数据后会丢失；不提供跨设备同步。
- 登录和注册保留表单，提交显示前端预览提示；本地账户、论坛写入和双人问答 API 不会被请求。
- 原站链接与原站鉴权下载保持各自的服务边界。

`verify-pages-preview.py` 覆盖首页资源、子路径菜单、搜索跳转、刷新、阅读标记、中文新增条目语言回退、浏览器后退、每日任务、登录提示、移动端宽度和未知路径 404，同时检查脚本异常、资源失败以及意外的 API/Flight 请求。线上可用 `--base-url https://88lin.github.io/howtolivebetter` 复跑；测试只在隔离浏览器中保存临时记录。
