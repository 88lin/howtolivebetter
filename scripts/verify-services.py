"""Exercise local services in disposable browser contexts and remove exact fixtures.

Run with the Next development server already running:
    python scripts/verify-services.py
This never uses a real browser profile or writes to the original website.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from urllib.parse import quote, urlsplit
from datetime import datetime, timezone
import json
import os
import sqlite3
import uuid

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("HOW_TEST_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
if urlsplit(BASE).hostname not in ("localhost", "127.0.0.1", "::1"):
    raise ValueError("Only local test servers are allowed")
TAG = uuid.uuid4().hex[:10]
EMAILS = [f"qa-{TAG}-alice@example.test", f"qa-{TAG}-bob@example.test"]
PASSWORD = "Local-QA-Password123!"
errors = []
checks = []
expect.set_options(timeout=15000)


def register(page, email, name, callback="/dashboard", direct=False):
    route = "/sign-up" if direct else "/sign-in"
    page.goto(BASE + route + "?callbackUrl=" + quote(callback, safe=""), wait_until="networkidle", timeout=90000)
    if not direct:
        page.get_by_role("button", name="没有本地账号？免费注册", exact=True).click()
    page.locator("input[name=name]").fill(name)
    page.locator("input[name=email]").fill(email)
    page.locator("input[name=password]").fill(PASSWORD)
    page.get_by_role("button", name="注册并继续", exact=True).click()
    page.wait_for_url("**" + callback, timeout=30000)
    page.wait_for_load_state("networkidle")


def hold_next_response(page, pattern):
    held = []
    used = [False]

    def intercept(route):
        if used[0]:
            route.continue_()
        else:
            used[0] = True
            held.append((route, route.fetch()))

    page.route(pattern, intercept)
    return held, intercept


def wait_for_held(page, held):
    for _ in range(200):
        if held:
            return
        page.wait_for_timeout(50)
    raise AssertionError("Expected background request did not arrive")


def release_response(page, pattern, held, intercept):
    route, response = held[0]
    route.fulfill(response=response)
    page.unroute(pattern, intercept)


def clean_fixtures():
    database_path = Path(os.environ.get("HOW_LOCAL_DATA_DIR", ROOT / ".data")) / "howtolivebetter.sqlite"
    if not database_path.exists():
        return
    db = sqlite3.connect(database_path, timeout=10)
    try:
        ids = [row[0] for row in db.execute("SELECT id FROM users WHERE email IN (?, ?)", EMAILS)]
        codes = set()
        for user_id in ids:
            codes.update(row[0] for row in db.execute("SELECT code FROM participants WHERE user_id = ?", (user_id,)))
        for code in codes:
            # Only conversations involving these uniquely named disposable accounts.
            db.execute("DELETE FROM answers WHERE code = ?", (code,))
            db.execute("DELETE FROM participants WHERE code = ?", (code,))
            db.execute("DELETE FROM conversations WHERE code = ?", (code,))
        for user_id in ids:
            for table in ["reports", "thanks", "replies", "answers", "participants", "progress", "sessions"]:
                db.execute("DELETE FROM " + table + " WHERE user_id = ?", (user_id,))
            db.execute("DELETE FROM topics WHERE user_id = ?", (user_id,))
            db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        db.commit()
    finally:
        db.close()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        alice_context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN")
        alice = alice_context.new_page()
        alice.on("pageerror", lambda error: errors.append(str(error)))
        for route in ["/forgot-password", "/reset-password", "/verify-email", "/wechat-login", "/wechat-nickname", "/auth-callback", "/redeem-invite", "/en/forgot-password"]:
            alice.goto(BASE + route, wait_until="networkidle")
            expect(alice.locator(".local-service-gateway h1")).to_be_visible()
            expect(alice.locator(".local-service-original")).to_have_attribute("href", "https://howtolivebetter.net" + ("/en" if route.startswith("/en/") else "") + "/sign-in")
            assert alice.locator(".animate-spin:visible").count() == 0
            alice.set_viewport_size({"width": 390, "height": 844})
            assert not alice.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        alice.set_viewport_size({"width": 1440, "height": 1000})
        checks.append("Auxiliary account routes replace loading states with original-service guidance; mobile layout")
        alice.goto(BASE + "/sign-in", wait_until="networkidle")
        alice.evaluate("localStorage.setItem('how-better-progress', JSON.stringify({'01-01': {status:'done', favorite:true, note:'QA checklist note'}}))")
        register(alice, EMAILS[0], "Local QA Alice", direct=True)
        expect(alice.locator(".life-sync-state")).to_contain_text("已同步到本地服务器", timeout=15000)
        saved = alice.request.get(BASE + "/api/local/progress").json()["progress"]
        assert saved["01-01"]["note"] == "QA checklist note"
        checks.append("Registration, guest checklist import and server synchronization")

        alice.goto(BASE + "/lab/new", wait_until="networkidle")
        alice.locator("input[name=title]").fill("Local QA topic " + TAG)
        alice.locator("select[name=category]").select_option("practice")
        alice.locator("textarea[name=body]").fill('A local test post. <script>throw new Error("unsafe")</script>')
        alice.get_by_role("button", name="发布到本地实验室", exact=True).click()
        alice.wait_for_url("**/lab?topic=*")
        alice.wait_for_load_state("networkidle")
        expect(alice.locator("main h1")).to_have_text("Local QA topic " + TAG)
        expect(alice.locator(".local-service-body").first).to_contain_text("<script>")
        alice.locator("textarea[name=reply]").fill("A useful local reply " + TAG)
        alice.get_by_role("button", name="发布本地回复", exact=True).click()
        expect(alice.locator(".lab-replies")).to_contain_text("A useful local reply " + TAG)
        alice.get_by_role("button", name="感谢 · 0", exact=True).click()
        expect(alice.get_by_role("button", name="✓ 感谢 · 1", exact=True)).to_be_visible()
        checks.append("Forum topic creation, detail, reply, thanks and escaped user content")

        alice.goto(BASE + "/together", wait_until="networkidle")
        alice.get_by_role("button", name="开始新的交流", exact=True).click()
        alice.wait_for_url("**/together?session=*")
        alice.wait_for_load_state("networkidle")
        invitation = alice.url.replace(BASE, "")
        polling_pattern = "**/api/local/together?code=*"
        held, intercept = hold_next_response(alice, polling_pattern)
        wait_for_held(alice, held)
        alice.locator("textarea[name=answer]").fill("Alice private answer " + TAG)
        alice.get_by_role("button", name="提交并揭晓", exact=True).click()
        expect(alice.locator(".connection-answer")).to_contain_text("Alice private answer " + TAG)
        release_response(alice, polling_pattern, held, intercept)
        alice.wait_for_timeout(250)
        expect(alice.locator(".connection-answer")).to_contain_text("Alice private answer " + TAG)

        bob_context = browser.new_context(viewport={"width": 390, "height": 844}, locale="zh-CN")
        bob = bob_context.new_page()
        bob.on("pageerror", lambda error: errors.append(str(error)))
        register(bob, EMAILS[1], "Local QA Bob", invitation)
        bob.get_by_role("button", name="加入这次两人交流", exact=True).click()
        expect(bob.locator("textarea[name=answer]")).to_be_visible()
        assert "Alice private answer" not in bob.locator("main").inner_text()
        bob.locator("textarea[name=answer]").fill("Bob submitted answer " + TAG)
        bob.get_by_role("button", name="提交并揭晓", exact=True).click()
        try:
            expect(bob.locator(".connection-pair")).to_contain_text("Alice private answer " + TAG)
        except AssertionError:
            print(json.dumps({"submissionStatus": bob.locator(".local-service-status").all_text_contents(), "pageErrors": errors}, ensure_ascii=False))
            raise
        alice.reload(wait_until="networkidle")
        expect(alice.locator(".connection-pair")).to_contain_text("Bob submitted answer " + TAG)
        alice.locator(".local-service-questions").get_by_role("button", name="2", exact=True).click()
        alice.locator("textarea[name=answer]").fill("A saved draft " + TAG)
        alice.get_by_role("button", name="保存草稿", exact=True).click()
        expect(alice.locator(".local-service-form .local-service-status")).to_contain_text("草稿已保存在本地服务器")
        code = invitation.split("session=", 1)[1]
        remote_edit = alice.request.post(BASE + "/api/local/together", headers={"Origin": BASE}, data={
            "action": "save", "code": code, "question": 1, "text": "Draft from another device",
        })
        assert remote_edit.status == 200
        held, intercept = hold_next_response(alice, polling_pattern)
        wait_for_held(alice, held)
        alice.locator("textarea[name=answer]").fill("Unsaved edit protected " + TAG)
        release_response(alice, polling_pattern, held, intercept)
        alice.wait_for_timeout(250)
        expect(alice.locator("textarea[name=answer]")).to_have_value("Unsaved edit protected " + TAG)
        alice.get_by_role("button", name="保存草稿", exact=True).click()
        expect(alice.locator(".local-service-form .local-service-status")).to_contain_text("草稿已保存在本地服务器")
        assert not bob.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        checks.append("Two independent browser contexts: invitation, joining, private answers, gated reveal, draft saving, mobile overflow")
        checks.append("Delayed polling cannot overwrite a newer submitted answer or an unsaved draft")

        alice.on("dialog", lambda dialog: dialog.accept())
        alice.get_by_role("button", name="删除整次交流", exact=True).click()
        alice.wait_for_url(BASE + "/together")
        alice.wait_for_load_state("networkidle")
        expect(alice.locator("main")).to_contain_text("还没有交流")
        alice.goto(BASE + "/sign-in", wait_until="networkidle")
        progress_pattern = "**/api/local/progress"
        held, intercept = hold_next_response(alice, progress_pattern)
        alice.evaluate("const p=JSON.parse(localStorage.getItem('how-better-progress'));p['01-01'].status='todo';localStorage.setItem('how-better-progress',JSON.stringify(p));window.dispatchEvent(new Event('how-progress'))")
        wait_for_held(alice, held)
        alice.get_by_role("button", name="退出登录", exact=True).click()
        alice.wait_for_timeout(250)
        expect(alice.get_by_role("heading", name="你的本地账号", exact=True)).to_be_visible()
        release_response(alice, progress_pattern, held, intercept)
        expect(alice.get_by_role("heading", name="登录本地账号", exact=True)).to_be_visible()
        assert alice.request.get(BASE + "/api/local/auth").json()["user"] is None

        fresh_context = browser.new_context(locale="zh-CN")
        fresh = fresh_context.new_page()
        fresh.goto(BASE + "/sign-in", wait_until="networkidle")
        fresh.locator("input[name=email]").fill(EMAILS[0])
        fresh.locator("input[name=password]").fill(PASSWORD)
        fresh.get_by_role("button", name="登录并继续", exact=True).click()
        fresh.wait_for_url("**/dashboard")
        fresh.wait_for_load_state("networkidle")
        expect(fresh.locator(".life-sync-state")).to_contain_text("已同步到本地服务器")
        assert fresh.evaluate("JSON.parse(localStorage.getItem('how-better-progress'))['01-01'].note") == "QA checklist note"
        checks.append("Conversation deletion, logout and fresh-device login restoring server checklist progress")
        checks.append("Logout waits for an in-flight checklist save before ending the session")
        assert not errors, errors
    finally:
        browser.close()
        clean_fixtures()

report = {
    "checkedAt": datetime.now(timezone.utc).isoformat(),
    "baseUrl": BASE,
    "browser": "Isolated headless Chromium; no real browser profile",
    "passed": checks,
    "pageErrors": errors,
    "fixtures": "Unique temporary accounts and their local data removed after testing",
}
output = ROOT / "docs" / "research" / "howtolivebetter" / "service-check.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False))
