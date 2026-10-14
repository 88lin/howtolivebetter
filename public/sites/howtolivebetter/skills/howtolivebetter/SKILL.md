---
name: howtolivebetter
description: Use HowToLiveBetter's open life guide to find relevant advice, compare costs and benefits, check evidence grades and sources, and link readers to the exact book entries. Use for questions about the guide or applying its advice; do not invoke for unrelated general knowledge.
---

# HowToLiveBetter

Use the live guide at https://howtolivebetter.net/book to help a reader explore practical choices. The guide currently has Chinese, English, Spanish, Russian, Japanese, and Vietnamese editions. This skill needs no account or API key.

## Find the relevant entries

1. Choose the reader's language: `zh` (default), `en`, `es`, `ru`, `ja`, or `vi`.
2. Fetch `https://howtolivebetter.net/ai/book/<locale>/index.md` with an HTTP client or available API/MCP tool. It lists chapter titles and short descriptions. Open the likely chapter overview, for example `https://howtolivebetter.net/ai/book/zh/01.md`, to see its entry titles and evidence grades. Match the reader's actual concern rather than treating every keyword match as a recommendation.
3. For promising entries, follow their links from the chapter overview to small parts such as `https://howtolivebetter.net/ai/book/zh/01-1.md#01-01`. Read the full cost, benefit, evidence, notes, and sources of each selected entry. Read `https://howtolivebetter.net/ai/articles/<locale>/index.md` when a related long-form article would help. If a Markdown file is unavailable, read the corresponding public website page instead.
4. Link each cited entry as `https://howtolivebetter.net/tip/<entryId>` for Chinese, or `https://howtolivebetter.net/<locale>/tip/<entryId>` for other languages. Keep the source URLs from the entry when discussing evidence. These Markdown files are generated from the website's published content; if a file and page disagree, check the page and state the discrepancy.

## Answer well

- Explain a small number of relevant options in the reader's language. For each, distinguish the guide's claim from your own inference, include the guide's evidence grade, meaningful costs or limits, and a direct entry link. Cite the original source URL when a factual claim relies on it.
- A/B/C are the guide's own evidence labels, not a guarantee that advice applies to this person. Entries marked as disputed require special care. Do not turn rough benefit estimates into promises.
- The Chinese original is authoritative. Other editions include unofficial and machine-assisted translations; for medical, legal, financial, or policy-sensitive wording, check the Chinese entry and current primary sources or local rules before making a strong claim.
- Ask only for the personal context needed to make a useful comparison. Do not put a reader's private details in website URL query parameters. These public Markdown files are read-only; do not claim to change the reader's saved progress or notes.
- If no entry fits, say so and offer the closest chapter or the [full book index](https://howtolivebetter.net/book). Never invent an entry, grade, source, or publication update.
