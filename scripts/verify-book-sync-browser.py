"""Check synchronized reading and language navigation in an isolated local browser."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base-url", default="http://127.0.0.1:3000")
args = parser.parse_args()
base = args.base_url.rstrip("/")
if urlsplit(base).hostname not in ("localhost", "127.0.0.1", "::1"):
    parser.error("Only local servers are allowed; the test writes isolated browser progress")
tips = json.loads((ROOT / "public/sites/howtolivebetter/tips-zh.json").read_text(encoding="utf-8"))
routes = {route["path"] for route in json.loads((ROOT / "src/content/howtolivebetter/routes.json").read_text(encoding="utf-8"))}
new_tip = next(tip for tip in tips if "/en/tip/" + tip["id"] not in routes)
chapter_tips = [tip for tip in tips if tip["chapterId"] == new_tip["chapterId"]]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.route("**/*", lambda route: route.continue_() if urlsplit(route.request.url).netloc == urlsplit(base).netloc else route.abort())
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def visit(path):
        response = page.goto(base + path, wait_until="networkidle", timeout=60000)
        assert response.status == 200, (path, response.status)

    visit("/book")
    expect(page.locator(".life-book-intro .life-eyebrow")).to_contain_text(str(len(tips)))
    page.evaluate("localStorage.setItem('how-better-progress', JSON.stringify({'01-01': {favorite: true, note: 'Existing note survives book updates'}}))")
    visit("/book/" + new_tip["chapterId"])
    expect(page.locator(".life-entry-card")).to_have_count(len(chapter_tips))
    new_card = page.locator('[id="' + new_tip["id"] + '"]')
    expect(new_card.locator(".life-entry-title-link")).to_have_text(new_tip["title"])
    new_card.locator(".life-action.done").click()
    expect(new_card.locator(".life-action.done")).to_have_attribute("aria-pressed", "true")
    visit("/tip/" + new_tip["id"])
    expect(page.locator("h1")).to_have_text(new_tip["title"])
    expect(page.locator(".life-action.done")).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("JSON.parse(localStorage.getItem('how-better-progress'))['01-01'].note") == "Existing note survives book updates"
    page.locator(".life-language-switch").click()
    english = page.locator('[role="menuitem"]').filter(has_text="English")
    expect(english).to_have_attribute("href", "/en/book/" + new_tip["chapterId"])
    english.click()
    page.wait_for_load_state("networkidle")
    expect(page).to_have_url(base + "/en/book/" + new_tip["chapterId"])
    visit("/tip/01-01")
    page.locator(".life-language-switch").click()
    expect(page.locator('[role="menuitem"]').filter(has_text="English")).to_have_attribute("href", "/en/tip/01-01")
    page.set_viewport_size({"width": 390, "height": 844})
    visit("/tip/" + new_tip["id"])
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Mobile overflow"
    assert not errors, errors
    print(json.dumps({"result": "PASS", "newTip": new_tip["id"], "chapterEntries": len(chapter_tips),
                      "checks": ["counts", "new route", "saved marks", "existing note", "language fallback", "existing translation", "mobile width"]}))
    browser.close()
