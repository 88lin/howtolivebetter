"""Check the reading workflow in an isolated Chromium context.

Start the app with npm run dev, then run:
  python scripts/verify-reader.py --base-url http://localhost:3000
Requires the Python playwright package and an installed Chromium browser.
No original-site resources or browser profiles are accessed.
"""
import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding="utf-8")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base-url", default="http://localhost:3000")
parser.add_argument("--browser-executable", default=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"))
args = parser.parse_args()
BASE = args.base_url.rstrip("/")
tip_data = json.loads((Path(__file__).resolve().parents[1] / "public/sites/howtolivebetter/tips-zh.json").read_text(encoding="utf-8"))
chapter_one = [tip for tip in tip_data if tip["chapterId"] == "01"]
if urlsplit(BASE).hostname not in ("localhost", "127.0.0.1", "::1"):
    parser.error("Use a local clone address; this test changes reading progress.")

with sync_playwright() as playwright:
    launch_options = {"headless": True}
    if args.browser_executable:
        launch_options["executable_path"] = args.browser_executable
    browser = playwright.chromium.launch(**launch_options)
    context = browser.new_context(permissions=["clipboard-read", "clipboard-write"])
    context.route("**/*", lambda route: route.continue_() if urlsplit(route.request.url).netloc == urlsplit(BASE).netloc else route.abort())
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def visit(path):
        response = page.goto(BASE + path, wait_until="networkidle", timeout=60000)
        assert response.status == 200, (path, response.status)

    visit("/book/01")
    first = page.locator('[id="01-01"]')
    first.locator(".life-action.done").click()
    expect(first.locator(".life-action.done")).to_have_attribute("aria-pressed", "true")
    first.locator(".life-action.todo").click()
    expect(first.locator(".life-action.done")).to_have_attribute("aria-pressed", "false")
    expect(first.locator(".life-action.todo")).to_have_attribute("aria-pressed", "true")
    first.locator(".life-action.done").click()
    first.locator(".life-action.favorite").click()
    first.locator(".life-detail-toggle").click()
    expect(first.locator(".life-entry-details")).to_be_visible()
    expect(first.locator(".life-entry-details a").first).to_have_attribute("href", "https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/813573")
    first.locator(".life-personal-note > button").click()
    first.locator("textarea").fill("本地验证：上车记得系安全带。")
    first.locator("[data-reader-save-note]").click()
    page.reload(wait_until="networkidle")
    expect(first.locator(".life-action.done")).to_have_attribute("aria-pressed", "true")
    first.locator(".life-detail-toggle").click()
    expect(first.locator(".life-personal-note > button")).to_have_text("本地验证：上车记得系安全带。")
    first.locator(".social-share-trigger").click()
    assert page.evaluate("navigator.clipboard.readText()") == BASE + "/tip/01-01"
    print("PASS: chapter status exclusivity, favorite, evidence links, note, reload, share", flush=True)

    visit("/dashboard")
    expect(page.locator(".life-count-card.done strong")).to_have_text("1")
    expect(page.locator(".life-count-card.favorite strong")).to_have_text("1")
    expect(page.locator('.life-topic-progress[href="/book/01"] .life-topic-progress-score')).to_have_text(f"{int(100 / len(chapter_one) + 0.5)}/100")
    page.locator(".life-filter-tabs button").nth(4).click()
    expect(page.locator(".life-dashboard-item")).to_have_count(1)
    with page.expect_download() as download_info:
        page.locator(".life-export-button").click()
    exported = Path(download_info.value.path()).read_text(encoding="utf-8-sig")
    assert "本地验证：上车记得系安全带。" in exported and "01-01" in exported
    page.locator(".life-filter-tabs button").nth(2).click()
    expect(page.locator(".life-dashboard-item")).to_have_count(0)
    print("PASS: dashboard counts, chapter score, favorites/todo filters, CSV", flush=True)

    visit("/book")
    search = page.locator(".life-search-wrap input")
    search.fill("安全带")
    expect(page.locator(".life-result-row").first).to_be_visible()
    assert page.locator(".life-result-row").count() >= 1
    search.fill("never-matches-789456")
    expect(page.locator(".life-result-row")).to_have_count(0)
    search.fill("")
    expect(page.locator(".life-chapter-grid")).to_be_visible()
    page.locator(".life-book-sidebar button").nth(1).click()
    expect(page.locator(".life-result-row")).to_have_count(len(chapter_one))
    page.locator(".book-filter-trigger").nth(2).click()
    page.locator('[data-reader-filter="evidence"][data-reader-value="A"]').click()
    expect(page.locator(".life-result-row")).to_have_count(sum(tip["evidence"].startswith("A") for tip in chapter_one))
    page.locator('[data-reader-reset]').click()
    expect(page.locator(".life-chapter-grid")).to_be_visible()
    page.locator(".book-filter-trigger").nth(0).click()
    assert page.locator('.book-filter-group button').all_text_contents() == ["极高", "高", "一般"]
    page.locator('[data-reader-filter="value"][data-reader-value="very_high"]').click()
    expect(page.locator('.life-result-row[href="/book/01#01-01"]')).to_be_visible()
    assert page.locator(".life-result-row").count() > 0
    page.locator('[data-reader-reset]').click()
    page.locator(".book-filter-trigger").nth(2).click()
    page.locator('[data-reader-filter="evidence"][data-reader-value="A"]').click()
    expect(page.locator('.life-result-row[href="/book/10#10-08"]')).to_be_visible()
    print("PASS: full-text search, no-result state, reset, chapter and evidence filters", flush=True)

    visit("/top-50")
    top = page.locator(".top50-item").first
    expect(top.locator(".top50-actions button").nth(0)).to_have_attribute("aria-pressed", "true")
    page.locator(".top50-item").nth(1).locator(".top50-actions button").nth(2).click()
    expect(page.locator(".top50-progress-card > strong")).to_have_text("2 / 50")
    page.locator(".top50-share-button").click()
    expect(page.locator("dialog")).to_be_visible()
    page.locator("dialog > .life-button.dark").click()
    share_url = page.evaluate("navigator.clipboard.readText()")
    assert "share=" in share_url
    other = context.new_page()
    other.goto(share_url, wait_until="networkidle")
    expect(other.locator("dialog .life-dashboard-item")).to_have_count(2)
    other.close()
    print("PASS: shared top-50 status, ignored state, generated/reopened share URL", flush=True)

    visit("/glossary")
    page.locator(".life-glossary-search input").fill("BMI")
    expect(page.locator(".life-glossary-row:visible")).to_have_count(1)
    expect(page.locator(".life-glossary-count")).to_have_text("1")
    page.locator(".life-glossary-search input").fill("absent-87654")
    expect(page.locator("[data-reader-glossary-empty]")).to_be_visible()
    print("PASS: glossary search and empty state", flush=True)

    visit("/en/book/01")
    expect(page.locator('[id="01-01"] .life-action.done')).to_have_attribute("aria-pressed", "true")
    page.locator('[id="01-01"] .life-detail-toggle').click()
    expect(page.locator('[id="01-01"] .life-entry-details')).to_be_visible()
    print("PASS: cross-language progress and details", flush=True)

    print(json.dumps({"pageErrors": errors}, ensure_ascii=False), flush=True)
    assert not errors
    browser.close()
