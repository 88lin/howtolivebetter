# HowToLiveBetter 本地全站迁移

用户指定使用 `88lin/ai-website-cloner-template`，完整迁移 `https://howtolivebetter.net/` 的页面。

实现基于 Next.js 16 / React 19 / TypeScript。原站是内容与生活工具网站；中文为默认语言，保留英、俄、西、日、越版本。页面以原站为视觉与文案依据，保留原书来源及许可。

公开页面、真实素材、阅读进度和个人生活工具在本地运行。原站账户、私人数据、微信公众号 OAuth 与下载授权无法从公开网页获取，本地账户和数据需独立存储，外部服务入口明确指向原站。

内容维护在 `src/content/howtolivebetter/pages/` 的语义节点数据中，行为在 `src/components/sites/howtolivebetter/`。禁止运行或分发原站生产 JavaScript。
