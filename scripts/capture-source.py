from pathlib import Path
from playwright.sync_api import sync_playwright
import json

root=Path(__file__).resolve().parents[1]
out=root/'docs/design-references/howtolivebetter'
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1,locale='zh-CN',color_scheme='light',reduced_motion='reduce')
    page=context.new_page()
    page.goto('https://howtolivebetter.net/',wait_until='domcontentloaded')
    page.locator('h1').wait_for()
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(1200)
    page.screenshot(path=str(out/'source-desktop-hero.png'))
    for y in range(0,page.evaluate('document.body.scrollHeight'),700):
        page.evaluate('(y)=>window.scrollTo(0,y)',y)
        page.wait_for_timeout(140)
    page.locator('video').evaluate('(v)=>v.pause()')
    print('source video',page.locator('video').evaluate('(v)=>({time:v.currentTime,controls:v.controls,poster:v.poster,paused:v.paused,ready:v.readyState})'),flush=True)
    page.wait_for_timeout(800)
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(out/'source-desktop.png'),full_page=True)
    page.locator('.life-nav-more').click()
    menu=page.locator('.life-header').inner_html()
    (root/'docs/research/howtolivebetter/menu-state.html').write_text(menu,encoding='utf8')
    page.goto('https://howtolivebetter.net/',wait_until='domcontentloaded')
    page.locator('h1').wait_for()
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(out/'source-mobile.png'))
    for y in range(0,page.evaluate('document.body.scrollHeight'),700):
        page.evaluate('(y)=>window.scrollTo(0,y)',y)
        page.wait_for_timeout(100)
    page.evaluate('window.scrollTo(0,0)')
    page.wait_for_timeout(500)
    page.screenshot(path=str(out/'source-mobile-full.png'),full_page=True)
    page.locator('details summary').first.click()
    page.screenshot(path=str(out/'source-mobile-faq.png'))
    print(json.dumps({'pageHeight':page.evaluate('document.body.scrollHeight'),'title':page.title(),'screenshots':5}))
    browser.close()
