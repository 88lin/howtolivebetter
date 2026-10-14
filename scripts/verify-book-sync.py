"""Verify synchronized pages, route metadata, data files and translation isolation."""
from collections import defaultdict
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("sync_book", ROOT / "scripts/sync-book.py")
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)


def verify(root):
    manifest = sync.read_json(root, sync.MANIFEST)
    tips = sync.read_json(root, sync.PUBLIC + "/tips-zh.json")
    assert manifest["tips"] == len(tips), "Manifest tip count"
    assert len({tip["id"] for tip in tips}) == len(tips), "Unique IDs"
    grouped = defaultdict(list)
    for tip in tips:
        grouped[tip["chapterId"]].append(tip)
        assert f"/blob/{manifest['commit']}/book/" in tip["sourceHref"], "Pinned provenance"
    assert len(grouped) == manifest["chapters"], "Manifest chapter count"
    combined = sync.read_json(root, sync.PUBLIC + "/tips.json")
    for locale in ("zh", "en", "es", "ru", "ja", "vi"):
        localized = sync.read_json(root, f"{sync.PUBLIC}/tips-{locale}.json")
        assert [tip for tip in combined if tip["locale"] == locale] == localized, f"Combined {locale} data"
    routes = {route["path"]: route for route in sync.read_json(root, "src/content/howtolivebetter/routes.json")}
    for chapter, items in grouped.items():
        page = sync.read_json(root, f"{sync.PAGES}/book~{chapter}.json")
        cards = [n for n in sync.walk(page) if sync.has_class(n, "life-entry-card")]
        assert [card["props"]["id"] for card in cards] == [tip["id"] for tip in items], f"Chapter {chapter} cards"
        for card, tip in zip(cards, items):
            assert sync.text(sync.find(card, "life-entry-title-link")) == tip["title"], tip["id"]
            assert sync.text(sync.find(card, "life-entry-summary")) == tip["summary"], tip["id"]
        for tip in items:
            path = "/tip/" + tip["id"]
            page = sync.read_json(root, f"{sync.PAGES}/tip~{tip['id']}.json")
            assert page["path"] == path and page["title"] == routes[path]["title"], path
            card = sync.find(page, "life-entry-card")
            assert sync.text(sync.find(card, tag="h1")) == tip["title"], path
            assert page["description"] == tip["summary"], path
            assert tip["note"] in sync.text(card), f"Full note: {path}"
            assert tip["cost"] in sync.text(card), f"Full cost: {path}"
            main = sync.find(page, "life-tip-page")
            for locale in main["props"]["data-tip-locales"].split(","):
                assert ("" if locale == "zh" else "/" + locale) + path in routes, f"Missing translation: {path}"
    directory = sync.read_json(root, f"{sync.PAGES}/book.json")
    assert f"{len(tips)} 条" in directory["title"], "Book metadata count"
    assert str(len(tips)) in sync.text(sync.find(directory, "life-book-intro")), "Book intro count"
    homepage = sync.read_json(root, f"{sync.PAGES}/index.json")
    assert sync.text(sync.find(sync.find(homepage, "life-hero-stats"), tag="strong")) == str(len(tips)), "Homepage count"
    print(json.dumps({"tips": len(tips), "chapters": len(grouped), "routes": len(routes),
                      "localesChecked": 6, "result": "PASS"}, ensure_ascii=False))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    verify(ROOT)
