"""Sync the original Chinese Markdown book into the existing site documents.

Only Python's standard library and Git are required. Upstream code is never run.
The default is a dry run; --write publishes validated changes to the worktree.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/eternity4719/HowToLiveBetter"
PUBLIC = "public/sites/howtolivebetter"
PAGES = "src/content/howtolivebetter/pages"
MANIFEST = "src/content/howtolivebetter/book-sync.json"
FIELDS = {"成本": "cost", "说人话": "summary", "收益": "benefit",
          "证据等级": "evidence", "来源": "sources", "备注": "note"}
ENTRY = re.compile(r"^### (\d+)\. (.+)$", re.M)


class SyncError(ValueError):
    pass


def git(directory, *args):
    return subprocess.check_output(["git", "-C", str(directory), *args], encoding="utf-8").strip()


def read_json(root, relative):
    return json.loads((root / relative).read_text(encoding="utf-8"))


def encoded(value, pretty=False):
    return json.dumps(value, ensure_ascii=False, indent=2 if pretty else None,
                      separators=None if pretty else (",", ":")).encode("utf-8")


def parse_book(source, commit):
    chapters, tips = {}, []
    digest = hashlib.sha256()
    files = sorted((source / "book").glob("[0-9][0-9]-*.md"))
    if not files:
        raise SyncError("No numbered book/*.md chapters found")
    for file in files:
        if file.is_symlink() or not file.resolve().is_relative_to(source.resolve()):
            raise SyncError(f"Unsafe source path: {file.name}")
        raw = file.read_text(encoding="utf-8").replace("\r\n", "\n")
        digest.update(file.name.encode("utf-8") + b"\0" + raw.encode("utf-8") + b"\0")
        chapter_id = file.name[:2]
        heading = re.search(r"^# (\d+)\. (.+)$", raw, re.M)
        if not heading or int(heading[1]) != int(chapter_id) or chapter_id in chapters:
            raise SyncError(f"Invalid or duplicate chapter: {file.name}")
        matches = list(ENTRY.finditer(raw))
        if not matches or len(matches) != len(re.findall(r"^### ", raw, re.M)):
            raise SyncError(f"Unrecognized entry headings: {file.name}")
        numbers = [int(match[1]) for match in matches]
        if numbers != list(range(1, len(matches) + 1)) or max(numbers) > 99:
            raise SyncError(f"Entry numbers must be unique, contiguous and <= 99: {file.name}")
        intro = raw[heading.end():matches[0].start()].strip().split("\n\n")[0]
        chapter = {"id": chapter_id, "title": heading[2].strip(), "intro": intro,
                   "file": "book/" + file.name, "count": len(matches)}
        chapter["sourceHref"] = f"{REPOSITORY}/blob/{commit}/{quote(chapter['file'])}"
        chapters[chapter_id] = chapter
        for index, match in enumerate(matches):
            ident = f"{chapter_id}-{int(match[1]):02d}"
            body = raw[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(raw)]
            labels = list(re.finditer(r"^- ([^：\n]+)：", body, re.M))
            if [label[1] for label in labels] != list(FIELDS):
                raise SyncError(f"Missing, duplicate, reordered or unknown fields: {ident}")
            item = {"id": ident, "chapterId": chapter_id, "title": match[2].strip()}
            for offset, label in enumerate(labels):
                end = labels[offset + 1].start() if offset + 1 < len(labels) else len(body)
                value = body[label.end():end].strip()
                # A final section separator is not part of the note.
                value = re.sub(r"\n\s*---\s*$", "", value).strip()
                if not value:
                    raise SyncError(f"Empty {label[1]}: {ident}")
                item[FIELDS[label[1]]] = value
            tag_match = re.search(r"<!--\s*成本标签:\s*(.*?)\s*-->", body)
            pairs = re.findall(r"([^\s=]+)=([^\s=]+)", tag_match[1] if tag_match else "")
            item["tags"] = dict(pairs)
            if len(pairs) != len(item["tags"]) or not {"钱", "时间", "毅力", "收益"} <= item["tags"].keys():
                raise SyncError(f"Missing or duplicate cost tags: {ident}")
            allowed = {"钱": {"0", "少", "多"}, "时间": {"少", "中", "多"},
                       "毅力": {"否", "些", "是"}, "收益": {"大", "中", "小"}}
            if any(item["tags"][key] not in values for key, values in allowed.items()):
                raise SyncError(f"Unknown cost tag value: {ident}")
            if not re.match(r"^[ABC](?:$|\b|[（( ·，、])", item["evidence"]):
                raise SyncError(f"Unknown evidence grade: {ident}")
            item.update(locale="zh", chapterTitle=chapter["title"], fullDetails=True,
                        href=f"/book/{chapter_id}#{ident}", sourceHref=chapter["sourceHref"])
            tips.append(item)
    return chapters, tips, digest.hexdigest()


def check_identity(previous, current):
    """Fail closed when ordinal IDs could point saved progress at another topic."""
    old, new = {tip["id"]: tip for tip in previous}, {tip["id"]: tip for tip in current}
    if len(old) != len(previous) or len(new) != len(current):
        raise SyncError("Duplicate tip IDs")
    missing = sorted(old.keys() - new.keys())
    if missing:
        raise SyncError("Upstream removed existing IDs; manual reconciliation required: " + ", ".join(missing))
    old_titles = defaultdict(set)
    for tip in previous:
        old_titles[tip["title"]].add(tip["id"])
    for ident, tip in new.items():
        if ident not in old:
            maximum = max(int(key.split("-")[1]) for key in old if key.startswith(tip["chapterId"] + "-"))
            if int(ident.split("-")[1]) <= maximum:
                raise SyncError(f"Reused entry number: {ident}")
            continue
        before = old[ident]
        if tip["title"] == before["title"]:
            continue
        if old_titles.get(tip["title"], set()) - {ident}:
            raise SyncError(f"Possible renumbering: {ident} now has another entry's title")
        title_similarity = SequenceMatcher(None, before["title"], tip["title"]).ratio()
        summary_similarity = SequenceMatcher(None, before["summary"], tip["summary"]).ratio()
        if title_similarity < 0.5 and summary_similarity < 0.6:
            raise SyncError(f"Possible replacement of topic {ident}; review its identity before syncing")


def node(tag, children=(), class_name=None, **props):
    if class_name is not None:
        props["className"] = class_name
    return {"tag": tag, "props": props, "children": list(children)}


def walk(value):
    if isinstance(value, dict):
        if "tag" in value:
            yield value
        for child in value.get("children", value.get("nodes", [])):
            yield from walk(child)


def has_class(value, name):
    return name in value["props"].get("className", "").split()


def find(value, class_name=None, tag=None):
    matches = [entry for entry in walk(value)
               if (class_name is None or has_class(entry, class_name)) and (tag is None or entry["tag"] == tag)]
    if not matches:
        raise SyncError(f"Page template missing {class_name or tag}")
    return matches[0]


def text(value):
    return value if isinstance(value, str) else "".join(text(child) for child in value["children"])


def set_text(value, content):
    value["children"] = [str(content)]


def leading_text(value, content):
    value["children"] = [str(content)] + [child for child in value["children"] if isinstance(child, dict)]


def excerpt(content, limit=150):
    return content if len(content) <= limit else content[:limit].rstrip() + "…"


def citations(content):
    """Only text and explicit HTTP(S) links; never interpret upstream HTML."""
    children, end = [], 0
    for match in re.finditer(r"<(https?://[^>]+)>|(https?://[^\s<>]+)", content):
        children.append(content[end:match.start()])
        url = (match[1] or match[2]).rstrip(".,;，；。")
        children.append(node("a", [url], href=url, target="_blank", rel="noopener noreferrer"))
        trailing = (match[1] or match[2])[len(url):]
        if trailing:
            children.append(trailing)
        end = match.end()
    children.append(content[end:])
    return children


def update_card(template, tip):
    card = deepcopy(template)
    card["props"]["id"] = tip["id"]
    set_text(find(card, "life-entry-number"), tip["id"].split("-")[1])
    grade = find(card, "life-evidence")
    grade["props"]["className"] = "life-evidence grade-" + tip["evidence"][0].lower()
    set_text(grade, "证据 " + tip["evidence"])
    heading = next(n for n in card["children"] if isinstance(n, dict) and n["tag"] in ("h1", "h2"))
    if heading["tag"] == "h2":
        heading["children"] = [node("a", [tip["title"]], "life-entry-title-link", href="/tip/" + tip["id"])]
    else:
        set_text(heading, tip["title"])
    set_text(find(card, "life-entry-summary"), tip["summary"])
    impact = find(card, "life-entry-impact")
    for section, key in zip(impact["children"], ("cost", "benefit")):
        set_text(find(section, tag="p"), excerpt(tip[key]))
    find(card, "life-entry-actions")["props"]["aria-label"] = "标记：" + tip["title"]
    details = next((n for n in walk(card) if has_class(n, "life-entry-details")), None)
    if details:
        personal = deepcopy(find(details, "life-personal-note"))
        details["children"] = [node("div", [node("span", [label], "life-detail-label"),
            node("p", citations(tip[key]), "life-citations")])
            for label, key in (("成本", "cost"), ("收益", "benefit"), ("来源", "sources"), ("原书备注", "note"))]
        details["children"].append(personal)
    return card


def sidebar_links(tips, current=None):
    return [node("a", [node("span", [tip["id"].split("-")[1]]), tip["title"]],
                 "active" if tip["id"] == current else "",
                 href=("/tip/" if current else "#") + tip["id"]) for tip in tips]


def update_chapter(page, chapter, tips, chapter_count):
    main = find(page, "life-reader-main")
    sidebar = find(page, "life-reader-sidebar")
    find(sidebar, tag="nav")["children"] = sidebar_links(tips)
    set_text(find(sidebar, "life-sidebar-caption"), f"章节 {chapter['id']} / {chapter_count}")
    head = find(main, "life-reader-head")
    set_text(find(head, "life-eyebrow"), f"第 {int(chapter['id'])} 章 / {len(tips)} 条建议")
    leading_text(find(head, tag="h1"), chapter["title"])
    set_text(find(head, tag="p"), chapter["intro"])
    find(head, "life-source-inline")["props"]["href"] = chapter["sourceHref"]
    set_text(find(find(head, "life-chapter-progress"), tag="small"), f"0 已做到 · 0 待做 · {len(tips)} 尚未标记")
    stack = find(main, "life-entry-stack")
    existing = {n["props"]["id"]: n for n in stack["children"] if isinstance(n, dict) and has_class(n, "life-entry-card")}
    template = next(iter(existing.values()))
    stack["children"] = [update_card(existing.get(tip["id"], template), tip) for tip in tips]
    page["title"] = chapter["title"] + " | HowToLiveBetter"
    page["description"] = f"阅读《高性价比人生指南》「{chapter['title']}」主题，查看建议的成本、收益与出处，并维护个人行动清单。"


def update_tip(page, tip, chapter_tips, chapter, pager_templates):
    page["path"] = "/tip/" + tip["id"]
    page["title"] = tip["title"] + " | HowToLiveBetter"
    page["description"] = tip["summary"]
    sidebar = find(page, "life-tip-sidebar")
    find(sidebar, "life-back-link")["props"]["href"] = "/book/" + tip["chapterId"]
    set_text(find(sidebar, "life-sidebar-caption"), chapter["title"])
    find(sidebar, tag="nav")["children"] = sidebar_links(chapter_tips, tip["id"])
    main = find(page, "life-tip-page")
    breadcrumb = find(main, "life-tip-breadcrumb")
    chapter_link = [n for n in breadcrumb["children"] if isinstance(n, dict) and n["tag"] == "a"][-1]
    chapter_link["props"]["href"] = "/book/" + tip["chapterId"]
    set_text(chapter_link, f"第 {int(tip['chapterId'])} 章 · {chapter['title']}")
    main["children"] = [update_card(n, tip) if isinstance(n, dict) and has_class(n, "life-entry-card") else n
                        for n in main["children"]]
    index = next(i for i, item in enumerate(chapter_tips) if item["id"] == tip["id"])
    pager = find(main, "life-tip-pager")
    pager["children"] = []
    for offset, label, direction in ((-1, "上一条", "prev"), (1, "下一条", "next")):
        adjacent = index + offset
        if 0 <= adjacent < len(chapter_tips):
            other = chapter_tips[adjacent]
            link = deepcopy(pager_templates[direction])
            link["props"]["href"] = "/tip/" + other["id"]
            find(link, tag="span")["children"] = [node("small", [label]), other["title"]]
            pager["children"].append(link)
        else:
            pager["children"].append(node("span"))
    related = find(main, "life-tip-related")
    by_id = {other["id"]: other for other in chapter_tips}
    related_ids = [n["props"]["href"].rsplit("/", 1)[-1] for n in walk(find(related, tag="ul")) if n["tag"] == "a"]
    others = [by_id[ident] for ident in related_ids if ident in by_id and ident != tip["id"]][:6]
    if len(others) < min(6, len(chapter_tips) - 1):
        chosen = {other["id"] for other in others} | {tip["id"]}
        others.extend(other for other in chapter_tips if other["id"] not in chosen)
        others = others[:6]
    find(related, tag="ul")["children"] = [node("li", [node("a", [node("strong", [other["title"]]),
        node("span", [excerpt(other["summary"], 80)])], href="/tip/" + other["id"])]) for other in others]
    link = find(related, "life-text-link")
    link["props"]["href"] = "/book/" + tip["chapterId"]
    leading_text(link, "阅读整个主题：" + chapter["title"] + " ")


def update_directory(page, chapters, total):
    page["title"] = f"《高性价比人生指南》免费在线阅读｜{total} 条循证建议"
    page["description"] = f"免费在线阅读《高性价比人生指南》{total} 条建议，按主题查看成本、收益、证据等级与来源。"
    set_text(find(find(page, "life-book-intro"), "life-eyebrow"), f"全书目录 / {total} 条建议")
    sidebar = find(page, "life-book-sidebar")
    buttons = [n for n in sidebar["children"] if isinstance(n, dict) and n["tag"] == "button"]
    if len(buttons) != len(chapters) + 1:
        raise SyncError("Book directory chapter buttons no longer match the source")
    set_text(find(buttons[0], tag="small"), total)
    for button, chapter in zip(buttons[1:], chapters.values()):
        button["children"] = [node("span", [chapter["id"]]), chapter["title"], node("small", [str(chapter["count"])])]
    results = find(page, "life-results-heading")
    for n in walk(results):
        if n["props"].get("role") == "status":
            set_text(n, f"{total} 条结果")
    grid = find(page, "life-chapter-grid")
    for tile in [n for n in grid["children"] if isinstance(n, dict) and n["tag"] == "a"]:
        chapter = chapters[tile["props"]["href"].rsplit("/", 1)[-1]]
        set_text(find(tile, tag="h3"), chapter["title"])
        set_text(find(tile, tag="p"), chapter["intro"])
        count = next(n for n in tile["children"] if isinstance(n, dict) and n["tag"] == "div")
        leading_text(count, f"{chapter['count']} 条建议 ")


def update_featured(page, tips):
    for card in [n for n in walk(page) if has_class(n, "top50-item")]:
        ident = find(card, "top50-source")["props"]["href"].split("#")[-1]
        tip = tips[ident]
        set_text(find(card, tag="h3"), tip["title"])
        set_text(find(card, "top50-summary"), tip["summary"])
        set_text(find(card, "top50-item-overline"), ident.replace("-", ".") + " · " + tip["evidence"])
        facts = find(card, "top50-facts")
        facts["children"] = [node("p", [node("b", [label]), excerpt(tip[key])])
                             for label, key in (("成本", "cost"), ("收益", "benefit"))]


def update_home(page, chapters, tips, date):
    stats = find(page, "life-hero-stats")
    figures = [n for n in walk(stats) if n["tag"] == "strong"]
    set_text(figures[0], len(tips))
    set_text(figures[1], len(chapters))
    stamp = find(find(page, "life-hero-updated"), tag="time")
    stamp["props"]["dateTime"] = date
    set_text(stamp, "中文原书更新于 " + date)
    for card in [n for n in walk(page) if has_class(n, "life-topic-card")]:
        chapter = chapters[card["props"]["href"].rsplit("/", 1)[-1]]
        set_text(find(find(card, "life-topic-bottom"), tag="span"), f"{chapter['count']} 条建议")
    # Downloads are provided by a different service and have their own release dates.
    download = find(page, "life-home-pdf-copy")
    set_text(find(download, tag="p"), "原站提供 PDF、EPUB、Word 等离线格式。离线版的内容数量与更新日期，以下载页面的说明为准。")
    for n in walk(page):
        if n["tag"] == "a" and re.fullmatch(r"/book/\d{2}#\d{2}-\d{2}", n["props"].get("href", "")):
            tip = tips[n["props"]["href"].split("#")[-1]]
            paragraphs = [child for child in walk(n) if child["tag"] == "p"]
            if paragraphs:
                set_text(paragraphs[0], tip["title"])


def plan_sync(root, source):
    commit = git(source, "rev-parse", "HEAD")
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise SyncError("Invalid upstream commit")
    if git(source, "status", "--porcelain", "--", "book"):
        raise SyncError("Source book has uncommitted changes; provenance would be inaccurate")
    committed_at = git(source, "show", "-s", "--format=%cI", "HEAD")
    chapters, tips, content_hash = parse_book(source, commit)
    previous = read_json(root, f"{PUBLIC}/tips-zh.json")
    old_chapters = {tip["chapterId"] for tip in previous}
    if old_chapters != chapters.keys():
        raise SyncError("Chapter set changed; adapt chapter layouts and tool references before syncing")
    check_identity(previous, tips)
    manifest_path = root / MANIFEST
    manifest = read_json(root, MANIFEST) if manifest_path.exists() else None
    if manifest and manifest["contentSha256"] == content_hash:
        # Ignore unrelated upstream commits; keep the recorded source URLs stable.
        commit, committed_at = manifest["commit"], manifest["committedAt"]
        chapters, tips, _ = parse_book(source, commit)
    grouped = defaultdict(list)
    for tip in tips:
        grouped[tip["chapterId"]].append(tip)
    tip_map = {tip["id"]: tip for tip in tips}
    outputs = {f"{PUBLIC}/tips-zh.json": encoded(tips)}
    combined = read_json(root, f"{PUBLIC}/tips.json")
    # Replace only the Chinese slice; translated books retain their original IDs.
    merged, inserted = [], False
    for tip in combined:
        if tip["locale"] == "zh":
            if not inserted:
                merged.extend(tips)
                inserted = True
        else:
            merged.append(tip)
    if not inserted:
        raise SyncError("Combined data has no Chinese locale")
    outputs[f"{PUBLIC}/tips.json"] = encoded(merged)
    routes = {item["path"]: item for item in read_json(root, "src/content/howtolivebetter/routes.json")}
    pager_page = read_json(root, f"{PAGES}/tip~01-02.json")
    pager_links = [n for n in walk(find(pager_page, "life-tip-pager")) if has_class(n, "life-tip-pager-link")]
    if len(pager_links) != 2:
        raise SyncError("Expected previous and next links in the detail page template")
    pager_templates = dict(zip(("prev", "next"), pager_links))

    def save_page(page):
        filename = page["path"].strip("/").replace("/", "~") or "index"
        filename += ".json"
        outputs[f"{PAGES}/{filename}"] = encoded(page)
        routes[page["path"]] = {"path": page["path"], "title": page["title"], "file": filename, "lang": page["lang"]}

    for ident, chapter in chapters.items():
        page = read_json(root, f"{PAGES}/book~{ident}.json")
        update_chapter(page, chapter, grouped[ident], len(chapters))
        # Chapter names in the next-chapter link track the current book too.
        for n in walk(page):
            if has_class(n, "life-next-chapter"):
                target = n["props"]["href"].rsplit("/", 1)[-1]
                set_text(find(n, tag="strong"), chapters[target]["title"])
        save_page(page)
        template = read_json(root, f"{PAGES}/tip~{ident}-01.json")
        for tip in grouped[ident]:
            existing = root / PAGES / ("tip~" + tip["id"] + ".json")
            detail = json.loads(existing.read_text(encoding="utf-8")) if existing.exists() else deepcopy(template)
            update_tip(detail, tip, grouped[ident], chapter, pager_templates)
            available = ["zh"] + [locale for locale in ("en", "ru", "es", "ja", "vi")
                                  if f"/{locale}/tip/{tip['id']}" in routes]
            find(detail, "life-tip-page")["props"]["data-tip-locales"] = ",".join(available)
            save_page(detail)
    directory = read_json(root, f"{PAGES}/book.json")
    update_directory(directory, chapters, len(tips))
    save_page(directory)
    featured = read_json(root, f"{PAGES}/top-50.json")
    update_featured(featured, tip_map)
    save_page(featured)
    home = read_json(root, f"{PAGES}/index.json")
    date = datetime.fromisoformat(committed_at).astimezone(timezone(timedelta(hours=8))).date().isoformat()
    update_home(home, chapters, tip_map, date)
    save_page(home)
    outputs["src/content/howtolivebetter/routes.json"] = encoded(sorted(routes.values(), key=lambda item: item["file"]), pretty=True)
    manifest = {"schemaVersion": 1, "repository": REPOSITORY, "branch": "main", "license": "CC-BY-4.0",
                "commit": commit, "committedAt": committed_at, "contentSha256": content_hash,
                "locale": "zh", "chapters": len(chapters), "tips": len(tips),
                "translations": "Unchanged website snapshot from 2026-10-11"}
    outputs[MANIFEST] = encoded(manifest, pretty=True)
    changed = {name: data for name, data in outputs.items()
               if not (root / name).exists() or (root / name).read_bytes().replace(b"\r\n", b"\n") != data}
    report = {"commit": commit, "chapters": len(chapters), "tips": len(tips),
              "added": sorted(tip_map.keys() - {tip["id"] for tip in previous}),
              "changedFiles": len(changed), "write": False}
    return changed, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, help="A clean checkout of the original book at a pinned commit")
    parser.add_argument("--write", action="store_true", help="Apply the validated sync; otherwise only report changes")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        with tempfile.TemporaryDirectory(prefix="how-book-sync-") as directory:
            source = args.source_dir.resolve() if args.source_dir else Path(directory) / "upstream"
            if args.source_dir is None:
                subprocess.run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse",
                                REPOSITORY + ".git", str(source)], check=True)
                subprocess.run(["git", "-C", str(source), "sparse-checkout", "set", "book"], check=True)
            changed, report = plan_sync(ROOT, source)
            if args.write:
                # All parsing, identity checks and rendering finish before the first write.
                # The provenance manifest is inserted last; Git publishes the whole result atomically.
                for name, data in changed.items():
                    target = ROOT / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    temporary = target.with_suffix(target.suffix + ".sync-tmp")
                    temporary.write_bytes(data)
                    temporary.replace(target)
                report["write"] = True
            print(json.dumps(report, ensure_ascii=False, indent=2))
    except (SyncError, subprocess.CalledProcessError) as error:
        print(f"Book sync stopped: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
