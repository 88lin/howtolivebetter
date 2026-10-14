"""Import public content and original assets into an editable React document model.

No source JavaScript is executed or shipped. Re-run to refresh public content.
Python requirements: beautifulsoup4. Network requests use the standard library.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlsplit, unquote
from bs4 import BeautifulSoup, Comment, NavigableString
import hashlib, json, re, time, subprocess, tempfile, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://howtolivebetter.net'
CACHE = ROOT / 'temp' / 'source'
CONTENT = ROOT / 'src' / 'content' / 'howtolivebetter'
PUBLIC = ROOT / 'public' / 'sites' / 'howtolivebetter'
for folder in [CACHE, CONTENT / 'pages', PUBLIC / 'styles']:
    folder.mkdir(parents=True, exist_ok=True)

assets = set()
records = {}
failures = []
aliases = {}
PROP = {'class':'className', 'for':'htmlFor', 'tabindex':'tabIndex', 'viewbox':'viewBox',
 'srcset':'srcSet', 'crossorigin':'crossOrigin', 'fetchpriority':'fetchPriority',
 'referrerpolicy':'referrerPolicy', 'playsinline':'playsInline', 'autoplay':'autoPlay',
 'readonly':'readOnly', 'maxlength':'maxLength', 'minlength':'minLength',
 'colspan':'colSpan', 'rowspan':'rowSpan', 'datetime':'dateTime',
 'accept-charset':'acceptCharset', 'contenteditable':'contentEditable',
 'charset':'charSet', 'http-equiv':'httpEquiv', 'frameborder':'frameBorder'}
BOOL = {'checked','selected','disabled','multiple','required','autofocus','hidden',
        'controls','loop','muted','autoplay','playsinline','open','reversed','readonly','inert'}

def request(url):
    for attempt in range(3):
        try:
            # Native curl uses the platform certificate store on Windows.
            # Keep TLS verification enabled; Python's bundled trust chain can differ.
            with tempfile.TemporaryDirectory(prefix='how-fetch-') as directory:
                target=Path(directory)/'response'
                result=subprocess.run(['curl','--fail','--location','--silent','--show-error',
                    '--max-time','60','--output',str(target),'--write-out','%{json}',url],
                    check=True,capture_output=True)
                meta=json.loads(result.stdout)
                return target.read_bytes(),meta.get('content_type',''),meta.get('url_effective',url)
        except Exception:
            if attempt == 2: raise
            time.sleep(1 + attempt)

def filename(route):
    return 'index' if route == '/' else route.strip('/').replace('/', '~')

def excluded_route(route):
    return route.rstrip('/').rsplit('/',1)[-1] in ('advertise','shengcaiyoushu')

def asset_url(url):
    absolute = urljoin(ORIGIN, url)
    parsed = urlsplit(absolute)
    if parsed.hostname not in ('howtolivebetter.net','downloads.howtolivebetter.net'):
        return url
    if parsed.path.startswith('/assets/') and parsed.path.endswith('.js'):
        return ''
    assets.add(absolute)
    part = ('downloads' if parsed.hostname.startswith('downloads.') else '') + parsed.path
    return '/sites/howtolivebetter/' + part.lstrip('/')

def style_object(value):
    result = {}
    for declaration in value.split(';'):
        if ':' not in declaration: continue
        key,val = declaration.split(':',1)
        key=key.strip()
        if not key: continue
        if not key.startswith('--'):
            key=re.sub(r'-([a-z])', lambda m:m[1].upper(),key)
        result[key]=val.strip()
    return result

def css_assets(css):
    def replace(match):
        url=match[1].strip('"\' ')
        if url.startswith(('data:','#')): return match[0]
        return 'url("'+asset_url(url)+'")'
    return re.sub(r'url\(([^)]+)\)',replace,css)

def node(element):
    if isinstance(element, Comment): return None
    if isinstance(element,NavigableString): return str(element)
    if element.name in ('script','style','noscript','link','meta'): return None
    if not element.name: return None
    classes=set(element.get('class',[]))
    if 'life-ad-layout' in classes:
        main=element.find('main',recursive=False)
        return node(main) if main else None
    if any(name.startswith('data-ad-') for name in element.attrs) or any(name.startswith('life-ad-') for name in classes): return None
    attrs={}
    for key,value in element.attrs.items():
        if key.startswith('on') or key.startswith('data-tsr') or key in ('nonce','integrity'): continue
        if isinstance(value,list): value=' '.join(value)
        if key=='style':
            attrs['style']=style_object(css_assets(value));continue
        if key in ('src','poster'):
            value=asset_url(value)
        if key=='srcset':
            value=', '.join(asset_url(part.strip().split(' ')[0])+(' '+part.strip().split(' ',1)[1] if ' ' in part.strip() else '') for part in value.split(','))
        if key=='href':
            if value.startswith(ORIGIN): value=value[len(ORIGIN):] or '/'
            translated_paths={'/vi/sách':'/vi/book','/vi/bảng điều khiển':'/vi/dashboard','/vi/ngày':'/vi/daily','/vi/bài viết':'/vi/articles','/vi/ngày-quốc-gia':'/vi/national-day'}
            value=translated_paths.get(unquote(value),value)
            if '/cdn-cgi/l/email-protection' in value:
                value='mailto:support@howtolivebetter.net'
            if re.search(r'\.(pdf|epub|docx|md|zip)(\?|$)',value): value=asset_url(value)
        if key in BOOL: value=True
        name=PROP.get(key,key)
        if element.name in ('svg','path','line','circle','rect','g','polygon','polyline','ellipse','stop','text','use','defs','linearGradient') and not key.startswith(('aria-','data-')):
            name=re.sub(r'-([a-z])',lambda m:m[1].upper(),name)
        attrs[name]=value
    if element.get('data-cfemail'):
        return {'tag':'span','props':{},'children':['support@howtolivebetter.net']}
    children=[n for e in element.children if (n:=node(e)) is not None]
    svg_tags={'lineargradient':'linearGradient','radialgradient':'radialGradient','clippath':'clipPath','textpath':'textPath','foreignobject':'foreignObject'}
    return {'tag':svg_tags.get(element.name,element.name),'props':attrs,'children':children}

def import_page(route):
    if excluded_route(route): return None,set()
    cache=CACHE/(filename(route)+'.html')
    if cache.exists():
        raw=cache.read_bytes();final=ORIGIN+route
    else:
        raw,kind,final=request(ORIGIN+route)
        if 'text/html' not in kind: raise ValueError('not an HTML page: '+kind)
        cache.write_bytes(raw)
    final_route=urlsplit(final).path.rstrip('/') or '/'
    if final_route!=route: aliases[route]=final_route
    soup=BeautifulSoup(raw.decode('utf-8'),'html.parser')
    if not soup.body: raise ValueError('missing body')
    styles=[]
    for tag in soup.select('style'):
        css=css_assets(tag.get_text())
        digest=hashlib.sha256(css.encode()).hexdigest()[:16]
        target=PUBLIC/'styles'/(digest+'.css')
        target.write_text(css,encoding='utf-8')
        styles.append('/sites/howtolivebetter/styles/'+target.name)
    for tag in soup.select('link[rel="stylesheet"]'):
        styles.append(asset_url(tag['href']))
    for tag in soup.select('link[rel="icon"],link[rel="apple-touch-icon"],link[as="font"]'):
        asset_url(tag['href'])
    title=soup.title.get_text() if soup.title else 'HowToLiveBetter'
    desc=soup.select_one('meta[name="description"]')
    content={'path':route,'title':title,'description':desc.get('content','') if desc else '',
             'lang':soup.html.get('lang','zh'),'styles':styles,
             'bodyClass':' '.join(soup.body.get('class',[])),
             'nodes':[n for e in soup.body.children if (n:=node(e)) is not None]}
    (CONTENT/'pages'/(filename(route)+'.json')).write_text(json.dumps(content,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    links=set()
    for anchor in soup.select('a[href]'):
        p=urlsplit(urljoin(ORIGIN,anchor['href']))
        if p.hostname=='howtolivebetter.net' and not excluded_route(p.path) and not p.path.startswith(('/api/','/cdn-cgi/','/assets/','/images/','/fonts/')) and not re.search(r'\.[a-z0-9]{2,5}$',p.path):
            links.add(unquote(p.path.rstrip('/')) or '/')
    return {'path':route,'title':title,'file':filename(route)+'.json','lang':content['lang']},links

def download_asset(url):
    parsed=urlsplit(url)
    relative=('downloads' if parsed.hostname.startswith('downloads.') else '')+unquote(parsed.path)
    target=(PUBLIC/relative.lstrip('/')).resolve()
    if not target.is_relative_to(PUBLIC.resolve()): raise ValueError('Unsafe asset path')
    if target.exists(): return {'source':url,'local':str(target.relative_to(ROOT)),'bytes':target.stat().st_size}
    raw,kind,_=request(url)
    if 'text/html' in kind: raise ValueError('asset returned HTML')
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(raw)
    return {'source':url,'local':str(target.relative_to(ROOT)),'bytes':len(raw),'type':kind}

def main():
    sitemap,_,_=request(ORIGIN+'/sitemap.xml')
    (ROOT/'docs/research/howtolivebetter/sitemap.xml').write_bytes(sitemap)
    routes={urlsplit(e.text).path.rstrip('/') or '/' for e in ET.fromstring(sitemap).findall('{*}url/{*}loc')}
    routes={route for route in routes if not excluded_route(route)}
    routes.update(['/dashboard','/sign-in','/search'])
    seen=set()
    while routes:
        batch=sorted(routes-seen,key=lambda p:(p.count('/'),len(p),p))
        if not batch: break
        routes=set();seen.update(batch)
        with ThreadPoolExecutor(max_workers=6) as pool:
            tasks={pool.submit(import_page,r):r for r in batch}
            for task in as_completed(tasks):
                route=tasks[task]
                try:
                    record,links=task.result();records[route]=record;routes.update(links-seen)
                except Exception as error:
                    failures.append({'url':ORIGIN+route,'error':str(error)})
                if len(records)%25==0: print('Pages imported:',len(records),'failures:',len(failures),flush=True)
        (CONTENT/'routes.json').write_text(json.dumps(sorted(records.values(),key=lambda r:r['path']),ensure_ascii=False,indent=2),encoding='utf-8')
        print('Discovered additional pages:',len(routes),flush=True)
    manifest=[]
    with ThreadPoolExecutor(max_workers=6) as pool:
        tasks={pool.submit(download_asset,u):u for u in sorted(assets)}
        for task in as_completed(tasks):
            try: manifest.append(task.result())
            except Exception as error: failures.append({'url':tasks[task],'error':str(error)})
            if len(manifest)%30==0: print('Assets downloaded:',len(manifest),flush=True)
    for name,data in [('asset-map',manifest),('import-errors',failures),('redirects',aliases)]:
        (ROOT/'docs/research/howtolivebetter'/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'pages':len(records),'assets':len(manifest),'failures':failures},ensure_ascii=False),flush=True)

if __name__=='__main__': main()
