"""Verify the exported frontend under its real subpath, without an SPA fallback.

Uses an isolated headless Chromium profile and a temporary local HTTP server.
Pass --base-url to run the same checks against the published preview.
"""
import argparse
import json
import re
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding="utf-8")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base-url")
parser.add_argument("--directory", type=Path, default=ROOT / ".tmp/pages-preview/out")
args = parser.parse_args()
server = None

if args.base_url:
    base = args.base_url.rstrip("/")
else:
    metadata = json.loads((args.directory / "preview.json").read_text(encoding="utf-8"))
    prefix = metadata["basePath"]

    class PreviewHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            path = urlsplit(self.path).path
            if path != prefix and not path.startswith(prefix + "/"):
                self.send_error(404)
                return
            super().do_GET()

        def translate_path(self, path):
            return super().translate_path(path[len(prefix):])

    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(PreviewHandler, directory=str(args.directory)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}{prefix}"

origin = urlsplit(base).netloc
prefix = urlsplit(base).path
tips = json.loads((ROOT / "public/sites/howtolivebetter/tips-zh.json").read_text(encoding="utf-8"))
routes = {route["path"] for route in json.loads((ROOT / "src/content/howtolivebetter/routes.json").read_text(encoding="utf-8"))}
new_tip = next(tip for tip in tips if "/en/tip/" + tip["id"] not in routes)

try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        requests, failures, errors = [], [], []
        context.route("**/*", lambda route: route.continue_() if urlsplit(route.request.url).netloc == origin else route.abort())
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: requests.append(request.url))
        page.on("requestfailed", lambda request: failures.append((request.url, request.failure)))
        page.on("response", lambda response: failures.append((response.url, response.status)) if response.status >= 400 and "__missing_preview_test__" not in response.url else None)

        def check_links():
            invalid = page.locator("a[href]").evaluate_all("""(links) => links.map(a => a.getAttribute('href')).filter(h => h.startsWith('/') && !h.startsWith('//'))""")
            assert all(h == prefix or h.startswith(prefix + "/") or h.startswith(prefix + "?") or h.startswith(prefix + "#") for h in invalid), invalid

        def visit(path):
            response = page.goto(base + path, wait_until="networkidle", timeout=60000)
            assert response.status == 200, (path, response.status)
            check_links()

        visit("/")
        assert "noindex" in page.locator('meta[name="robots"]').get_attribute("content")
        page.evaluate("document.fonts.ready")
        assert page.evaluate("document.fonts.check('16px sans-serif')")
        broken_images = page.locator("img").evaluate_all("(images) => images.filter(i => i.complete && i.currentSrc && !i.naturalWidth).map(i => i.currentSrc)")
        assert not broken_images, broken_images
        page.locator(".life-nav-more").click()
        check_links()
        page.keyboard.press("Escape")
        page.locator(".life-theme-trigger").click()
        page.locator('[role="menuitem"]').nth(2).click()
        expect(page.locator("html")).to_have_class(re.compile(r"dark"))
        page.locator(".life-theme-trigger").click()
        page.locator('[role="menuitem"]').nth(1).click()
        page.locator(f'header a[href="{prefix}/book"]').first.click()
        page.wait_for_load_state("networkidle")
        expect(page).to_have_url(base + "/book/")
        print("PASS: home assets, menus, theme and document navigation", flush=True)

        page.locator(".life-search-wrap input").fill("安全带")
        result = page.locator(".life-result-row").first
        expect(result).to_be_visible()
        assert result.get_attribute("href").startswith(prefix + "/book/")
        result.click()
        page.wait_for_load_state("networkidle")
        page.reload(wait_until="networkidle")
        first = page.locator('[id="01-01"] .life-action.done')
        first.click()
        page.reload(wait_until="networkidle")
        expect(first).to_have_attribute("aria-pressed", "true")
        visit("/dashboard/")
        expect(page.locator(".life-count-card.done strong")).to_have_text("1")
        visit("/tip/" + new_tip["id"] + "/")
        page.locator(".life-language-switch").click()
        english = page.locator('[role="menuitem"]').filter(has_text="English")
        expect(english).to_have_attribute("href", prefix + "/en/book/" + new_tip["chapterId"])
        english.click()
        page.wait_for_load_state("networkidle")
        expect(page).to_have_url(base + "/en/book/" + new_tip["chapterId"] + "/")
        page.go_back(wait_until="networkidle")
        expect(page).to_have_url(base + "/tip/" + new_tip["id"] + "/")
        print("PASS: search, deep links, refresh, saved marks, language fallback and browser back", flush=True)

        visit("/daily/")
        page.locator('[data-tool-action="daily-draw"]').click()
        page.locator('[data-tool-action="daily-complete"]').click()
        page.reload(wait_until="networkidle")
        expect(page.locator(".daily-task-card")).to_have_class("daily-task-card is-done")
        check_links()
        visit("/sign-in/")
        expect(page.locator(".life-auth-panel")).to_contain_text("前端界面预览")
        page.locator('input[name="email"]').fill("preview@example.test")
        page.locator('input[name="password"]').fill("Preview-only-123!")
        page.locator('.local-service-form button[type="submit"]').click()
        expect(page.locator(".life-auth-panel")).to_contain_text("这是前端预览")
        page.locator(".life-auth-panel > button.local-service-link").click()
        expect(page.locator('input[name="name"]')).to_be_visible()
        expect(page.locator(".life-auth-panel")).to_contain_text("前端界面预览")
        print("PASS: daily task persistence and disabled server operations", flush=True)

        page.set_viewport_size({"width": 390, "height": 844})
        for path in ["/", "/book/", "/tip/" + new_tip["id"] + "/"]:
            visit(path)
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), ("Mobile overflow", path)
        response = page.goto(base + "/__missing_preview_test__/", wait_until="networkidle")
        assert response.status == 404, response.status
        assert not [url for url in requests if "/api/local/" in url or urlsplit(url).path.endswith(".txt")], "Unexpected API or client-navigation request"
        assert not failures, failures
        assert not errors, errors
        print(json.dumps({"result": "PASS", "baseUrl": base, "checks": ["mobile width", "real 404", "no API/Flight requests", "no failed assets", "no script errors"], "requests": len(requests)}, ensure_ascii=False), flush=True)
        browser.close()
finally:
    if server:
        server.shutdown()
        server.server_close()
