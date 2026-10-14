"""Extract the public book's structured data without executing source JavaScript.

Reads the HTML cache created by import-site.py. Chapter SSR contains short
entries; an individual tip's SSR includes its entire chapter with full sources.
Run again after the site import to incorporate all available translations.
"""
from pathlib import Path
import json
import re

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "temp" / "source"
PUBLIC = ROOT / "public" / "sites" / "howtolivebetter"
LOCALES = ("zh", "en", "ja", "es", "ru", "vi")
ENTRY = re.compile(r'\{id:"(\d{2}-\d{2})",chapterId:"(\d{2})"')
STRING = r'"(?:\\.|[^"\\])*"'
FIELDS = ("id", "chapterId", "title", "summary", "cost", "benefit", "evidence", "sources", "note")


def decode(value):
    # Seroval uses JS \xNN escapes, which JSON does not accept.
    value = re.sub(r"\\x([\da-fA-F]{2})", r"\\u00\1", value)
    return json.loads(value)


def entries(raw):
    script = "\n".join(re.findall(r'<script\b[^>]*data-tsr-stream-part[^>]*>(.*?)</script>', raw, re.S))
    matches = list(ENTRY.finditer(script))
    values = {}
    for index, match in enumerate(matches):
        fragment = script[match.start():matches[index + 1].start() if index + 1 < len(matches) else len(script)]
        entry = {}
        for field in FIELDS:
            found = re.search(r"\b" + field + r":(" + STRING + ")", fragment)
            if found:
                entry[field] = decode(found[1])
        if not all(key in entry for key in ("id", "chapterId", "title", "summary")):
            continue
        tags = re.search(r'tags:\$R\[\d+\]=(\{[^}]*\})', fragment)
        entry["tags"] = decode(tags[1]) if tags else {}
        entry["fullDetails"] = "deferred:!0" not in fragment[:fragment.find("tags:") + 180]
        existing = values.get(entry["id"])
        if not existing or len(entry.get("sources", "")) >= len(existing.get("sources", "")):
            values[entry["id"]] = entry
    return values


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    all_entries = []
    report = {}
    for locale in LOCALES:
        prefix = "" if locale == "zh" else locale + "~"
        route_prefix = "" if locale == "zh" else "/" + locale
        localized = []
        for number in range(1, 35):
            chapter_id = f"{number:02d}"
            page = CACHE / f"{prefix}book~{chapter_id}.html"
            if not page.exists():
                continue
            raw = page.read_text(encoding="utf-8")
            soup = BeautifulSoup(raw, "html.parser")
            heading = soup.select_one(".life-reader-head h1")
            if heading:
                for decoration in heading.select("span"):
                    decoration.decompose()
            source = soup.select_one(".life-source-inline")
            values = entries(raw)
            # One tip payload carries the full chapter; do not parse 677 copies.
            for tip_page in sorted(CACHE.glob(f"{prefix}tip~{chapter_id}-*.html")):
                complete = entries(tip_page.read_text(encoding="utf-8"))
                if len(complete) >= len(values) and any(v.get("sources") for v in complete.values()):
                    values.update(complete)
                    break
            for entry in values.values():
                entry.update({
                    "locale": locale,
                    "chapterTitle": heading.get_text(strip=True) if heading else chapter_id,
                    "href": f"{route_prefix}/book/{chapter_id}#{entry['id']}",
                    "sourceHref": source.get("href", "") if source else "",
                })
                localized.append(entry)
        localized.sort(key=lambda tip: tip["id"])
        if len(localized) != 677:
            raise ValueError(f"Expected 677 entries for {locale}, found {len(localized)}")
        if len({tip["id"] for tip in localized}) != len(localized):
            raise ValueError(f"Duplicate entries for {locale}")
        (PUBLIC / f"tips-{locale}.json").write_text(json.dumps(localized, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        all_entries.extend(localized)
        report[locale] = {"entries": len(localized), "withSources": sum(bool(tip.get("sources")) for tip in localized)}
    (PUBLIC / "tips.json").write_text(json.dumps(all_entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
