"""Mirror public images used by articles and product cards; preserve outbound links."""
from pathlib import Path
from urllib.parse import urlsplit
from concurrent.futures import ThreadPoolExecutor, as_completed
import importlib.util,json,hashlib
spec=importlib.util.spec_from_file_location('site',Path(__file__).with_name('import-site.py'))
site=importlib.util.module_from_spec(spec);spec.loader.exec_module(site)
urls={};changed=[]
def local(url):
    if not url.startswith('https://'):return url
    p=urlsplit(url)
    if p.hostname not in ['static01.nyt.com','img14.360buyimg.com','img30.360buyimg.com']:return url
    relative=Path('external')/p.hostname/p.path.lstrip('/')
    if p.query:relative=relative.with_stem(relative.stem+'-'+hashlib.sha256(p.query.encode()).hexdigest()[:10])
    path='/sites/howtolivebetter/'+relative.as_posix();urls[url]=path
    return path
def walk(value):
    if isinstance(value,dict):
        for key,item in value.items():
            if key in ('src','poster') and isinstance(item,str):value[key]=local(item)
            elif key=='srcSet' and isinstance(item,str):
                value[key]=', '.join(local(p.strip().split(' ')[0])+(' '+p.strip().split(' ',1)[1] if ' ' in p.strip() else '') for p in item.split(','))
            else:walk(item)
    elif isinstance(value,list):
        for item in value:walk(item)
for file in (site.CONTENT/'pages').glob('*.json'):
    original=file.read_text(encoding='utf8')
    if not any(h in original for h in ['static01.nyt.com','img14.360buyimg.com','img30.360buyimg.com']):continue
    data=json.loads(original);walk(data['nodes']);changed.append((file,data))
def fetch(item):
    url,local_path=item;target=site.ROOT/'public'/local_path.lstrip('/')
    if not target.exists():
        raw,kind,_=site.request(url)
        if not kind.startswith('image/'):raise ValueError('Expected image: '+url)
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    return {'source':url,'local':local_path,'bytes':target.stat().st_size}
with ThreadPoolExecutor(max_workers=4) as pool:
    manifest=list(pool.map(fetch,urls.items()))
for file,data in changed:
    pending=file.with_suffix('.json.tmp');pending.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8');pending.replace(file)
(site.ROOT/'docs/research/howtolivebetter/external-asset-map.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('External public images:',len(manifest),'updated pages:',len(changed))
