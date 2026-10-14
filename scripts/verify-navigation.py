"""Check the real navigation states and source geometry, not only open/close."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse, json, sys
sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url',default='http://127.0.0.1:3000')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'src/content/howtolivebetter/navigation.json').read_text(encoding='utf-8'))
reference=json.loads((root/'docs/research/howtolivebetter/navigation-source-rules.json').read_text(encoding='utf-8'))
result={'baseUrl':args.base_url,'passed':[],'pageErrors':[],'menus':{}}
def near(actual,expected,tolerance=1):
    assert abs(actual-expected)<=tolerance,(actual,expected)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000},locale='zh-CN',color_scheme='light',reduced_motion='reduce')
    page=context.new_page();page.on('pageerror',lambda e:result['pageErrors'].append(str(e)))
    page.goto(args.base_url,wait_until='networkidle')
    page.locator('.life-nav-more').click();page.locator('[role=menu]').wait_for();page.keyboard.press('Escape')
    for y,expected in [(72,False),(73,True),(650,True),(0,False)]:
        page.evaluate('(y)=>window.scrollTo({top:y,behavior:"instant"})',y);page.wait_for_timeout(150)
        assert page.locator('.life-header').evaluate('(e)=>e.classList.contains("is-scrolled")')==expected
        rect=page.locator('.life-header').bounding_box()
        near(rect['width'],1250 if expected else 1440);near(rect['height'],64 if expected else 77)
    result['passed'].append('Source scroll threshold at 72px, floating geometry and reverse reset')
    for kind,selector in [('more','.life-nav-more'),('language','.life-language-switch'),('theme','.life-theme-trigger')]:
        page.locator(selector).click();menu=page.locator('[role=menu]');menu.wait_for();page.wait_for_timeout(200)
        rect=menu.bounding_box();result['menus'][kind]=rect
        for key in ['x','y','width','height']:near(rect[key],reference['menus'][kind]['rect'][key])
        assert menu.evaluate('(e)=>getComputedStyle(e).fontFamily')==reference['menus'][kind]['font']
        page.keyboard.press('Escape');assert page.locator('[role=menu]').count()==0
        assert page.locator(selector).evaluate('(e)=>document.activeElement===e')
    result['passed'].append('More, language and theme menu position, size and font match source')
    page.locator('.life-nav-more').focus();page.keyboard.press('ArrowDown')
    assert page.evaluate('document.activeElement.textContent')=='冥想'
    page.keyboard.press('End');assert page.evaluate('document.activeElement.textContent')=='更新日志'
    page.keyboard.press('Home');assert page.evaluate('document.activeElement.textContent')=='冥想'
    page.keyboard.press('ArrowDown');assert page.evaluate('document.activeElement.textContent')=='番茄钟'
    page.keyboard.press('Escape');page.keyboard.press('ArrowUp')
    assert page.evaluate('document.activeElement.textContent')=='更新日志'
    page.keyboard.press('Escape');page.locator('.life-nav-more').click();page.mouse.click(30,150)
    assert page.locator('[role=menu]').count()==0
    result['passed'].append('Keyboard item navigation, Escape focus return and outside dismissal')
    page.locator('.life-theme-trigger').click();page.get_by_role('menuitem',name='深色模式',exact=True).click()
    assert page.locator('html').evaluate('(e)=>e.classList.contains("dark")')
    page.locator('.life-theme-trigger').click();assert page.get_by_role('menuitem',name='深色模式',exact=True).locator('.lucide-check').count()==1
    page.keyboard.press('Escape');page.reload(wait_until='networkidle')
    assert page.locator('html').evaluate('(e)=>e.classList.contains("dark")')
    page.locator('.life-theme-trigger').click();page.get_by_role('menuitem',name='浅色模式',exact=True).click()
    sound=page.locator('.life-sound-toggle');sound.click()
    assert sound.get_attribute('aria-pressed')=='false'
    muted_icon=sound.locator('svg').get_attribute('class');page.reload(wait_until='networkidle')
    assert sound.get_attribute('aria-pressed')=='false' and sound.locator('svg').get_attribute('class')==muted_icon
    sound.click();assert sound.get_attribute('aria-pressed')=='true'
    assert sound.locator('svg').get_attribute('class')!=muted_icon
    result['passed'].append('Theme checkmark, dark mode and sound icon state survive reload')
    for width in [390,768,1440,1920]:
        page.set_viewport_size({'width':width,'height':844 if width==390 else 1000})
        page.evaluate('window.scrollTo({top:650,behavior:"instant"})');page.wait_for_timeout(200)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        page.evaluate('window.scrollTo({top:0,behavior:"instant"})');page.wait_for_timeout(200)
        trigger=page.locator('.life-tabbar button') if width<760 else page.locator('.life-nav-more')
        trigger.click();page.locator('[role=menu]').wait_for();page.wait_for_timeout(200)
        menu=page.locator('[role=menu]').bounding_box()
        assert menu['x']>=0 and menu['x']+menu['width']<=width+1
        if width==390:
            for key,value in {'x':173,'y':294,'width':212,'height':484}.items():near(menu[key],value)
        page.keyboard.press('Escape')
    result['passed'].append('390/768/1440/1920 widths; mobile menu matches source and avoids bottom tabs')
    page.set_viewport_size({'width':1440,'height':1000})
    for lang,items in data['more'].items():
        page.goto(args.base_url+('/' if lang=='zh' else '/'+lang),wait_until='networkidle')
        page.locator('.life-nav-more').click();page.locator('[role=menu]').wait_for()
        actual=page.locator('[role=menuitem]').evaluate_all('(es)=>es.map(e=>({label:e.textContent.trim(),href:e.getAttribute("href")}))')
        assert actual==[{'label':i['label'],'href':i['href']} for i in items],lang
        assert page.locator('[role=menuitem] svg').count()==len(items)
        page.keyboard.press('Escape')
    result['passed'].append('All six languages use source menu labels, ordering, icons and local destinations')
    page.goto(args.base_url+'/book/01?view=all#tips',wait_until='networkidle')
    page.locator('.life-language-switch').click();page.locator('[role=menu]').wait_for()
    assert page.get_by_role('menuitem',name='English',exact=True).get_attribute('href')=='/en/book/01?view=all#tips'
    page.get_by_role('menuitem',name='English',exact=True).click();page.wait_for_url('**/en/book/01?view=all#tips')
    page.wait_for_load_state('networkidle');assert page.locator('html').get_attribute('lang')=='en'
    result['passed'].append('Language switching navigates a real chapter while retaining query and anchor')
    browser.close()
assert not result['pageErrors'],result['pageErrors']
(root/'docs/research/howtolivebetter/navigation-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
