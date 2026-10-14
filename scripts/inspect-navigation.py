"""Capture source/local navigation states in isolated browser contexts."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse, json, sys
sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--local-only',action='store_true')
parser.add_argument('--base-url',default='http://127.0.0.1:3000')
args=parser.parse_args()

root = Path(__file__).resolve().parents[1]
out = root / 'docs/design-references/howtolivebetter/navigation'
out.mkdir(parents=True, exist_ok=True)
report=root/'docs/research/howtolivebetter/navigation-inspection.json'
results = json.loads(report.read_text(encoding='utf-8')) if args.local_only and report.exists() else {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    targets=[('local',args.base_url)] if args.local_only else [('source','https://howtolivebetter.net'),('local',args.base_url)]
    for name, url in targets:
        context = browser.new_context(viewport={'width':1440,'height':1000}, locale='zh-CN', color_scheme='light', reduced_motion='reduce')
        page = context.new_page()
        page.goto(url, wait_until='networkidle', timeout=90000)
        page.evaluate('document.fonts.ready')
        def capture(state, mobile=False):
            page.wait_for_timeout(400)
            results[name+'-'+state] = page.evaluate('''() => ({
              header: document.querySelector('.life-header')?.outerHTML,
              menus: [...document.querySelectorAll('[role="menu"], [role="dialog"]')].map(e=>e.outerHTML),
              headerStyle: (()=>{const e=document.querySelector('.life-header'),s=getComputedStyle(e),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,position:s.position,font:s.font,bg:s.backgroundColor}})(),
              bodyClass: document.body.className, htmlClass: document.documentElement.className,
              localStorage: {...localStorage}
            })''')
            page.screenshot(path=str(out/f'{name}-{state}.png'), clip=None if mobile else {'x':0,'y':0,'width':1440,'height':min(840,1000)})
            print(name,state,results[name+'-'+state]['headerStyle'],flush=True)
        capture('top')
        page.mouse.wheel(0,650); page.wait_for_timeout(800); capture('scroll')
        page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(300)
        for label,selector in [('more','.life-nav-more'),('language','.life-language-switch'),('theme','.life-theme-trigger')]:
            page.locator(selector).click()
            page.locator('[role="menu"]').wait_for()
            page.wait_for_timeout(1800)
            capture(label)
            page.keyboard.press('Escape')
            page.mouse.click(20,500)
        page.set_viewport_size({'width':390,'height':844})
        page.evaluate('window.scrollTo(0,0)');capture('mobile',True)
        page.locator('.life-tabbar button').click();page.locator('[role="menu"]').wait_for();page.wait_for_timeout(1800);capture('mobile-more',True)
        context.close()
    browser.close()
report.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
