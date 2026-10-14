"""Full-page evidence: force deferred offscreen paint without changing UI styles."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--local-only',action='store_true',help='Preserve the saved source reference and only capture localhost')
parser.add_argument('--viewport',choices=['all','desktop','mobile'],default='all',help='Use a fresh context for each viewport; optionally preserve the other captures')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
out=root/'docs/design-references/howtolivebetter'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    targets=[('local','http://127.0.0.1:3000/')] if args.local_only else [('source','https://howtolivebetter.net/'),('local','http://127.0.0.1:3000/')]
    viewports=[('mobile-full',390,844),('desktop',1440,1000)]
    if args.viewport!='all':
        viewports=[item for item in viewports if item[0].startswith(args.viewport)]
    for name,url,size in [(name,url,size) for name,url in targets for size in viewports]:
        label,width,height=size
        context=browser.new_context(viewport={'width':width,'height':height},locale='zh-CN',color_scheme='light',reduced_motion='reduce',device_scale_factor=1)
        page=context.new_page()
        page.goto(url,wait_until='networkidle',timeout=90000)
        page.add_style_tag(content='* { content-visibility: visible !important; contain-intrinsic-size: none !important; scroll-behavior: auto !important; }')
        page.evaluate('''async () => {
          await document.fonts.ready;
          const images = [...document.images].filter(i=>i.getAttribute('src'));
          images.forEach(i=>i.loading='eager');
          await Promise.all(images.map(i=>i.decode().catch(()=>undefined)));
        }''')
        for round in range(2):
            for y in range(0,page.evaluate('document.body.scrollHeight'),600):
                page.evaluate('(y)=>window.scrollTo(0,y)',y);page.wait_for_timeout(250)
        page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(1200)
        print(name,label,'broken images',page.locator('img[src]').evaluate_all('(es)=>es.filter(i=>!i.naturalWidth).map(i=>i.currentSrc||i.src)'),flush=True)
        page.screenshot(path=str(out/(name+'-'+label+'.png')),full_page=True)
        print(name,label,page.evaluate('document.body.scrollHeight'),flush=True)
        context.close()
    browser.close()
