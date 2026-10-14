# HowToLiveBetter full-site inventory

Inspection date: 2026-10-11 (Asia/Shanghai). Source: https://howtolivebetter.net/.

## Evidence and counting

Read-only public HTTP inspection covered robots, sitemap, llms, homepage, 43 additional page requests, public route registrations, and named API references in public scripts. No login, posting, account mutation, or existing browser profile access occurred. Production JavaScript was downloaded only into `.tmp/site-inventory/` to identify routes/API dependencies; it is not implementation code.

- Sitemap: **417 URLs** = Chinese 72 + English/Russian/Spanish/Japanese/Vietnamese 69 each.
- Removing language prefixes gives **72 sitemap destinations**.
- Client route registration has **72 route patterns** = **65 static paths + 7 dynamic patterns**. This count happens to equal the sitemap-base count but describes a different set.
- Reading content: **34 chapters, 677 advice entries, 10 longform articles, 41 glossary terms**.
- `/tip/01-01` was verified to return the complete advice detail. Generate the other `/tip/{id}` destinations from imported chapter entries rather than fetching thousands of duplicate pages.
- `/blog` redirects to `/articles`. `/blog/$slug` remains registered; no slug redirect was tested.
- Source is TanStack Start/React, while the target template is Next.js. Rebuild templates/components and use extracted content/assets only.

## Language coverage

Chinese uses unprefixed URLs. The five translated roots are `/en`, `/ru`, `/es`, `/ja`, `/vi`; translated subpages prepend that prefix to the base path. The sitemap lists all five translations for the 69 paths below. Only `/lab`, its one published topic, and `/layoff` are Chinese-only in the sitemap. This is confirmed publication evidence, not an assertion that every omitted translation returns 404.

Extra registered paths have been observed primarily in Chinese. Their translated rendering is not yet verified; do not infer six-language availability from the existence of a route registration. `/retrospective` translated destinations deliberately preserve the Chinese article body (the page discloses this).

```json
[
  "/",
  "/about",
  "/articles",
  "/articles/36-questions",
  "/articles/after-a-layoff",
  "/articles/before-and-after-birth",
  "/articles/changing-jobs-or-cities",
  "/articles/circadian-rhythm",
  "/articles/helping-a-stranger",
  "/articles/home-emergency-kit",
  "/articles/marriage",
  "/articles/new-chronic-diagnosis",
  "/articles/platform-licenses",
  "/bingo",
  "/book",
  "/book/01",
  "/book/02",
  "/book/03",
  "/book/04",
  "/book/05",
  "/book/06",
  "/book/07",
  "/book/08",
  "/book/09",
  "/book/10",
  "/book/11",
  "/book/12",
  "/book/13",
  "/book/14",
  "/book/15",
  "/book/16",
  "/book/17",
  "/book/18",
  "/book/19",
  "/book/20",
  "/book/21",
  "/book/22",
  "/book/23",
  "/book/24",
  "/book/25",
  "/book/26",
  "/book/27",
  "/book/28",
  "/book/29",
  "/book/30",
  "/book/31",
  "/book/32",
  "/book/33",
  "/book/34",
  "/book/download",
  "/changelog",
  "/checkup",
  "/contact",
  "/daily",
  "/glossary",
  "/meditation",
  "/national-day",
  "/pomodoro",
  "/privacy-policy",
  "/products",
  "/quiz",
  "/retrospective",
  "/shengcaiyoushu",
  "/terms-of-service",
  "/top-50",
  "/value",
  "/value/ai",
  "/value/exercise",
  "/value/food"
]
```

## All registered static routes

Paths below are normalized without trailing slash. Nested `/admin` and `/settings` children are resolved to full URLs; route-group names such as `(auth)` and `(pages)` are not part of the public URL.

```json
[
  "/",
  "/about",
  "/admin",
  "/admin/categories",
  "/admin/credits",
  "/admin/invite-codes",
  "/admin/payments",
  "/admin/permissions",
  "/admin/posts",
  "/admin/roles",
  "/admin/settings",
  "/admin/subscriptions",
  "/admin/tickets",
  "/admin/users",
  "/advertise",
  "/articles",
  "/auth-callback",
  "/bingo",
  "/bingo/share",
  "/blog",
  "/book",
  "/book/download",
  "/changelog",
  "/checkup",
  "/checkup/plans",
  "/checkup/report",
  "/contact",
  "/daily",
  "/dashboard",
  "/forgot-password",
  "/glossary",
  "/lab",
  "/lab/new",
  "/lab/review",
  "/layoff",
  "/layoff/pack",
  "/meditation",
  "/national-day",
  "/pomodoro",
  "/pricing",
  "/privacy-policy",
  "/products",
  "/quiz",
  "/quiz/share",
  "/redeem-invite",
  "/reset-password",
  "/retrospective",
  "/settings",
  "/settings/apikeys",
  "/settings/billing",
  "/settings/credits",
  "/settings/payments",
  "/settings/profile",
  "/settings/tickets",
  "/shengcaiyoushu",
  "/sign-in",
  "/sign-up",
  "/terms-of-service",
  "/together",
  "/top-50",
  "/top-50/share",
  "/value",
  "/verify-email",
  "/wechat-login",
  "/wechat-nickname"
]
```

Dynamic registered patterns:

```json
[
  "/articles/$slug",
  "/blog/$slug",
  "/book/$chapter",
  "/lab/t/$id",
  "/tip/$id",
  "/together/$id",
  "/value/$topic"
]
```

Static registration entries absent from the sitemap base list (useful for the additional migration pass):

```json
[
  "/admin",
  "/admin/categories",
  "/admin/credits",
  "/admin/invite-codes",
  "/admin/payments",
  "/admin/permissions",
  "/admin/posts",
  "/admin/roles",
  "/admin/settings",
  "/admin/subscriptions",
  "/admin/tickets",
  "/admin/users",
  "/advertise",
  "/auth-callback",
  "/bingo/share",
  "/blog",
  "/checkup/plans",
  "/checkup/report",
  "/dashboard",
  "/forgot-password",
  "/lab/new",
  "/lab/review",
  "/layoff/pack",
  "/pricing",
  "/quiz/share",
  "/redeem-invite",
  "/reset-password",
  "/settings",
  "/settings/apikeys",
  "/settings/billing",
  "/settings/credits",
  "/settings/payments",
  "/settings/profile",
  "/settings/tickets",
  "/sign-in",
  "/sign-up",
  "/together",
  "/top-50/share",
  "/verify-email",
  "/wechat-login",
  "/wechat-nickname"
]
```

## Page and functionality migration map

| Route family | Content/state to reproduce | Source dependency |
|---|---|---|
| `/` | Full homepage, chapter navigation, featured advice, video, menu, language selection, footer | Public HTML and assets |
| `/book`, `/book/01` … `/book/34`, `/tip/{id}` | Search/filter, complete entries and sources, expand/collapse, completed/todo/ignored, bookmarks, personal notes, sharing | Content public; guest progress local; account sync server |
| `/articles`, `/articles/{slug}`, `/glossary` | 10 full articles, 41 terms, original citations and links | Public Markdown and HTML |
| `/top-50`, `/top-50/share` | 50 selected entries, progress, share snapshot; invalid-share state | Guest state local; share query encodes snapshot |
| `/dashboard` | All 34 chapter progress cards, status/bookmark filters, notes, CSV export | Guest mode works without login; account sync server |
| `/checkup`, `/checkup/report`, `/checkup/plans` | Five-question self-check, ten suggested actions, parents' action pack, report, plan management, calendar export | Basic self-check local; saved parents' plans use authenticated server |
| `/daily` | 30 possible short tasks, draw/replace, one completion per local day, calendar heatmap, totals/streaks | Guest records local; account records and optional leaderboard server |
| `/bingo`, `/bingo/share` | Nine no-cost actions, replace cell/group, toggle done, completed lines, add incomplete to todos, image/link sharing | Selection local; done status shared with dashboard; share query snapshot |
| `/quiz`, `/quiz/share` | 60-question bank in 5 topics; random 20 (4/topic), shuffled choices, 5 points each; score, explanation and share | Guest progress local; share encodes topic totals, not answers |
| `/pomodoro` | Focus/short/long breaks, timer, task list/estimated rounds, sound, notification opt-in, today and seven-day history, CSV | Browser-only features; timestamp-based resume after sleep |
| `/meditation` | Breath 4s/6s, silent sitting/body scan; 3/5/10/15 minutes; sound/notification/history/CSV | Browser-only features |
| `/layoff`, `/layoff/pack` | Employment dates, compensation/insurance questions, optional caps/tax/annual leave/noncompete, result and deadline pack | Inputs stored locally; no salary/date upload advertised |
| `/national-day` | Archived 2026 travel guide; five stages, twenty checklist items, related book entries | Travel checklist local and independent from life progress |
| `/value`, `/value/exercise`, `/value/food`, `/value/ai` | 12 exercises, 11 foods, 13 AI products, groups, evidence, original links, recommendation vote | Content public; votes require login/server |
| `/products` | 17 JD product cards, category filter, reasons and original book links, real outbound product URLs | Public static catalog/outbound shopping |
| `/lab`, `/lab/t/{id}`, `/lab/new`, `/lab/review` | Five topic filters, pagination; one published topic with zero public replies at inspection; publish/reply/thanks/report/moderation states | Public list/detail GET; mutations require server/login |
| `/together`, `/together/{id}` | Original 36-question exchange, invite link, simultaneous reveal after submission, skip, resume/delete session | Authenticated multi-user server; private answers are not publicly extractable |
| `/book/download` | Current four offline formats plus Anki messaging, login-to-download sheet, access state | Actual generated offline files access-gated; do not bypass |
| `/about`, `/contact`, `/privacy-policy`, `/terms-of-service`, `/changelog`, `/retrospective` | Full informational/editorial pages, history and images, source attribution | Public HTML |
| `/advertise`, `/shengcaiyoushu`, `/pricing` | Period picker and mail contact; community/affiliate landing; free-use information | Public content and outbound links |
| Authentication routes | Sign-in/up, password reset, email verify, WeChat login/nickname, callback and invite states | Better Auth and WeChat backend/config |
| `/settings/*`, `/admin/*` | Registered account/admin shells and inaccessible states | Private account data and role authorization unavailable to public extraction |

## Public content and asset sources

- `/robots.txt`: allows `/`, disallows `/admin`, `/settings`, `/api/`, and query URLs for crawlers; references `/sitemap.xml`.
- `/ai/book/{locale}/index.md`: all 34 chapter headings, descriptions and chapter Markdown links.
- `/ai/book/{locale}/01.md` (and other chapter numbers): chapter introduction and links to entry batches. Follow actual links, e.g. `/ai/book/zh/01-1.md#01-01`; chapter indexes alone do not contain every entry body.
- `/ai/articles/{locale}/index.md` and its ten article links: complete longform content.
- `/ai/glossary/{locale}.md`: glossary Markdown.
- `/llms-full.txt`: large combined Chinese/English reading file; directory files are easier to import reproducibly.
- `/skills/howtolivebetter/SKILL.md`: public reader guidance, not website source.
- Homepage/module HTML declares actual local images/fonts and video files under `/images/`, `/fonts/`, `/videos/`; video media uses `https://downloads.howtolivebetter.net/`.
- Original book: `https://github.com/eternity4719/HowToLiveBetter`, CC BY 4.0. Website-imported book revision: `70cc838c8791447eb455115c5a66da3d497dc3c4`; article revision: `33362aff50f97f413b22ddfcdb355d2a536a5700`.
- The website explicitly says it is independently operated by Ben and is not the original author's official site. The book repository is not evidence of website source-code availability. GitHub repository search for `howtolivebetter.net` returned zero repositories; no public website implementation repository was identified.

## API references and migration boundary

These endpoint names were observed in public client references. Except for the two noted GET checks, they were not executed by this inventory task. Mutation endpoints must not be exercised against the original service.

| Endpoint | Purpose and accessibility |
|---|---|
| `GET /api/config/public` | Verified public configuration: WeChat MP login enabled; password reset disabled; email verification disabled |
| `/api/auth` | Better Auth base; real sessions/accounts are not migratable from frontend HTML |
| `/api/auth/wechat/verify`, `/api/auth/wechat/pair/start`, `/api/auth/wechat/pair/claim` | WeChat verification/pairing; not public reusable content |
| `/api/life-progress` | Account checklist sync; local guest data can be reimplemented |
| `/api/daily/?tz={timezone}`, `/api/daily/leaderboard` | Daily records / leaderboard |
| `/api/lab?{query}` | Public forum list; node names `lifestyle`, `tools`, `practice`, `ask`, `feedback` |
| `/api/lab/{id}` | Forum topic/detail reference; one sitemap ID is `06f89854-021f-4226-a87c-456558b96d3b` |
| `/api/lab/replies`, `/api/lab/thanks`, `/api/lab/reports` | Reply, thanks, report mutations, requiring a real backend |
| `/api/connection`, `/api/connection?page={page}`, `/api/connection/{id}` | 36-question exchanges; authenticated, private session content; there is no confirmed public answers endpoint |
| `/api/value-votes` | Topic recommendation counts/votes; observed API name, public GET accessibility not tested |
| `GET /api/book/download-access?locale=zh` | Verified result: `authenticated:false, allowed:false`. Reproduce access UI or provide your own licensed generated downloads; don't claim original files migrated |
| `/api/anonymous-stats` | Consent-controlled aggregate telemetry; not needed to clone local reading functionality |

Current `/book/download` HTML requires login to show download links. `/llms.txt` still describes an older one-time WeChat passcode flow; prioritize current rendered behavior. The `/checkup` hero also still says 654 entries while its FAQ says 677; preserve observed copy unless explicitly correcting source inconsistencies.

## Evidence files

- `.tmp/site-inventory/routes.json`: all 417 sitemap URLs and 72 normalized base destinations.
- `.tmp/site-inventory/registered-routes.json`: normalized 65 static / 7 dynamic registrations.
- `.tmp/site-inventory/page-observations.json`: all 43 requested page statuses, final URLs, titles, extracted body copy, links, and referenced modules.
- `.tmp/site-inventory/api-references.json`: named scripts and endpoint references.
- `.tmp/site-inventory/home.html`, `sitemap.xml`, `robots.txt`, `llms.txt`, `public-config.json`, `download-access.json`: raw evidence.

A successful migration can deliver all public reading routes and guest interactions locally. Existing accounts, private notes, private conversation answers, administrative data, authorization secrets and original cloud services are not recoverable from public pages; those require independently configured services or explicit integration credentials. Do not route local write actions to the original site's API.
