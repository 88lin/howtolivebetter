"""Compare representative rendered pages in an isolated browser profile."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, sys
sys.stdout.reconfigure(encoding='utf-8')

root=Path(__file__).resolve().parents[1]
out=root/'docs/design-references/howtolivebetter'
results={'pages':[], 'consoleErrors':[], 'failedRequests':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1,locale='zh-CN',color_scheme='light',reduced_motion='reduce')
    page=context.new_page()
    page.on('pageerror',lambda error: results['consoleErrors'].append(str(error)))
    page.on('console',lambda message: results['consoleErrors'].append(message.text) if message.type=='error' else None)
    page.on('response',lambda response: results['failedRequests'].append({'url':response.url,'status':response.status}) if response.status>=400 else None)
    page.goto('http://127.0.0.1:3000/',wait_until='networkidle',timeout=120000)
    page.locator('h1').wait_for();page.evaluate('document.fonts.ready')
    page.wait_for_timeout(500)
    page.screenshot(path=str(out/'local-desktop-hero.png'))
    for y in range(0,page.evaluate('document.body.scrollHeight'),700):
        page.evaluate('(y)=>window.scrollTo(0,y)',y);page.wait_for_timeout(100)
    page.wait_for_timeout(500)
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(out/'local-desktop.png'),full_page=True)
    page.locator('.life-hero-carousel-controls > button').last.click()
    assert page.locator('.life-hero-advice.is-active').get_attribute('aria-label')=='2 / 5'
    page.locator('.life-nav-more').click();assert page.locator('.local-navigation-menu').is_visible()
    page.keyboard.press('Escape');assert page.locator('.local-navigation-menu').count()==0
    page.locator('.life-theme-trigger').click();page.get_by_role('menuitem',name='深色模式',exact=True).click()
    assert page.locator('html').evaluate('(e)=>e.classList.contains("dark")')
    page.locator('.life-theme-trigger').click();page.get_by_role('menuitem',name='浅色模式',exact=True).click()
    page.locator('.life-language-switch').click();assert page.get_by_role('menuitem',name='English',exact=True).get_attribute('href')=='/en'
    page.keyboard.press('Escape')
    page.set_viewport_size({'width':390,'height':844});page.evaluate('window.scrollTo(0,0)')
    page.locator('.life-hero-carousel-dots button').first.click()
    page.locator('h1').evaluate('(e)=>e.focus()')
    page.evaluate('document.activeElement.blur();window.scrollTo(0,0)')
    page.screenshot(path=str(out/'local-mobile.png'))
    for y in range(0,page.evaluate('document.body.scrollHeight'),700):
        page.evaluate('(y)=>window.scrollTo(0,y)',y);page.wait_for_timeout(100)
    page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(400)
    page.screenshot(path=str(out/'local-mobile-full.png'),full_page=True)
    page.locator('.life-tabbar button').click();assert page.locator('.local-navigation-menu').is_visible();page.keyboard.press('Escape')
    page.locator('details summary').first.click();assert page.locator('details').first.get_attribute('open') is not None
    page.screenshot(path=str(out/'local-mobile-faq.png'))
    results['shell']='carousel, desktop/mobile menu, keyboard dismissal, theme, language, FAQ passed'
    for width in [390,768,1440,1920]:
        page.set_viewport_size({'width':width,'height':1000})
        page.goto('http://127.0.0.1:3000/',wait_until='domcontentloaded')
        page.locator('h1').wait_for()
        results['pages'].append({'path':'/','width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth+1')})
    for route in ['/book','/book/01','/articles/36-questions','/value','/en','/ru/book','/ja/daily','/es/quiz','/vi/meditation','/products','/national-day']:
        page.set_viewport_size({'width':1440,'height':1000})
        response=page.goto('http://127.0.0.1:3000'+route,wait_until='networkidle',timeout=90000)
        assert page.locator('.life-ad-space,.life-ad-rail,.life-ad-dock,[data-ad-placement],.life-advertise-page').count()==0,route
        results['pages'].append({'path':route,'status':response.status,'title':page.title(),'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),'brokenImages':page.locator('img').evaluate_all('(es)=>es.filter(e=>e.complete&&!e.naturalWidth).map(e=>e.src)')})
        if route in ['/book','/book/01','/articles/36-questions']:
            page.screenshot(path=str(out/('local-'+route.strip('/').replace('/','-')+'.png')))
    for route in ['/advertise','/en/advertise','/ru/advertise','/es/advertise','/ja/advertise','/vi/advertise',
                  '/shengcaiyoushu','/en/shengcaiyoushu','/ru/shengcaiyoushu','/es/shengcaiyoushu','/ja/shengcaiyoushu','/vi/shengcaiyoushu']:
        response=page.goto('http://127.0.0.1:3000'+route,wait_until='networkidle')
        assert response.status==404,(route,response.status)
    results['advertising']='all paid placements removed; advertising and sponsored pages return 404'
    browser.close()
(root/'docs/research/howtolivebetter/visual-check.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(results,ensure_ascii=False))
raise SystemExit(1 if results['consoleErrors'] or results['failedRequests'] or any(page.get('overflow') or page.get('brokenImages') or page.get('status',200)!=200 for page in results['pages']) else 0)
