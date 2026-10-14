"""Extract public navigation labels and actual SVGs, without source JavaScript."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, sys
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[1]
data={'more':{},'themes':{},'icons':{},'classes':{}}
evidence={'source':'https://howtolivebetter.net','scroll':{},'menus':{}}
extract='''(menu) => {
  const node=e=>({tag:e.tagName,attributes:Object.fromEntries([...e.attributes].map(a=>[a.name,a.value])),children:[...e.children].map(node)});
  return {className:menu.className,font:getComputedStyle(menu).fontFamily,rect:menu.getBoundingClientRect().toJSON(),items:[...menu.querySelectorAll('[role="menuitem"]')].map(e=>({label:e.textContent.trim(),href:e.getAttribute('href'),className:e.className,icons:[...e.querySelectorAll('svg')].map(node)}))};
}'''
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000},locale='zh-CN',reduced_motion='reduce',color_scheme='light')
    page=context.new_page()
    for lang in ['zh','en','ru','es','ja','vi']:
        page.goto('https://howtolivebetter.net'+('' if lang=='zh' else '/'+lang),wait_until='networkidle',timeout=90000)
        page.locator('.life-nav-more').click()
        menu=page.locator('[role="menu"]');menu.wait_for()
        captured=menu.evaluate(extract)
        items=[]
        for item in captured['items']:
            icon=item['icons'][0]
            icon_key=icon['attributes']['class'].split()[1]
            data['icons'][icon_key]=icon
            items.append({'label':item['label'],'href':item['href'],'icon':icon_key})
        data['more'][lang]=items
        if lang=='zh':
            data['classes']['more']=captured['className']
            data['classes']['item']=captured['items'][0]['className']
            evidence['menus']['more']={k:captured[k] for k in ['font','rect']}
        page.keyboard.press('Escape')
        page.locator('.life-theme-trigger').click();menu.wait_for()
        captured=menu.evaluate(extract)
        data['themes'][lang]=[item['label'] for item in captured['items']]
        for item in captured['items']:
            for icon in item['icons']:
                data['icons'][icon['attributes']['class'].split()[1]]=icon
        if lang=='zh':
            data['classes']['theme']=captured['className']
            evidence['menus']['theme']={k:captured[k] for k in ['font','rect']}
        page.keyboard.press('Escape')
        if lang=='zh':
            page.locator('.life-language-switch').click();menu.wait_for()
            captured=menu.evaluate(extract)
            data['languages']=[{'code':code,'label':item['label']} for code,item in zip(['zh','en','ru','es','ja','vi'],captured['items'])]
            evidence['menus']['language']={k:captured[k] for k in ['font','rect']}
            page.keyboard.press('Escape')
            for y in [0,1,20,32,36,40,48,64]:
                page.evaluate('(y)=>window.scrollTo(0,y)',y);page.wait_for_timeout(100)
                evidence['scroll'][str(y)]=page.locator('.life-header').get_attribute('class')
            page.evaluate('window.scrollTo(0,0)')
            page.locator('.life-sound-toggle').click()
            icon=page.locator('.life-sound-toggle svg').evaluate('''e=>{const node=e=>({tag:e.tagName,attributes:Object.fromEntries([...e.attributes].map(a=>[a.name,a.value])),children:[...e.children].map(node)});return node(e)}''')
            data['icons']['sound-muted']=icon
            page.locator('.life-sound-toggle').click()
            icon=page.locator('.life-sound-toggle svg').evaluate('''e=>{const node=e=>({tag:e.tagName,attributes:Object.fromEntries([...e.attributes].map(a=>[a.name,a.value])),children:[...e.children].map(node)});return node(e)}''')
            data['icons']['sound-enabled']=icon
        print(lang,len(items),'navigation items',flush=True)
    browser.close()
(root/'src/content/howtolivebetter/navigation.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'docs/research/howtolivebetter/navigation-source-rules.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
