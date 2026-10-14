"""Verify the complete route index and every local asset/link in imported content."""
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json,re,collections
root=Path(__file__).resolve().parents[1]
pages=root/'src/content/howtolivebetter/pages'
routes={}
links=collections.defaultdict(set);assets=collections.defaultdict(set)
def walk(value,route):
    if isinstance(value,dict):
        for key,item in value.items():
            if key=='href' and isinstance(item,str) and item.startswith('/'):
                path=unquote(urlsplit(item).path).rstrip('/') or '/'
                if path.startswith('/sites/'):assets[path].add(route)
                else:links[path].add(route)
            elif key in ('src','poster','srcSet') and isinstance(item,str):
                for part in item.split(','):
                    path=part.strip().split(' ')[0]
                    if path.startswith('/sites/'):assets[unquote(urlsplit(path).path)].add(route)
            else: walk(item,route)
    elif isinstance(value,list):
        for item in value:walk(item,route)
for file in sorted(pages.glob('*.json')):
    data=json.loads(file.read_text(encoding='utf8'));route=data['path']
    routes[route]={'path':route,'title':data['title'],'file':file.name,'lang':data['lang']}
    walk(data['nodes'],route)
    for style in data['styles']:assets[style].add(route)
for file in (root/'public/sites/howtolivebetter/styles').glob('*.css'):
    for url in re.findall(r'url\([\"\']?([^\)\"\']+)',file.read_text(encoding='utf8')):
        if url.startswith('/sites/'):assets[unquote(urlsplit(url).path)].add(str(file.relative_to(root)))
missing_links=[{'path':p,'from':sorted(r)[:4]} for p,r in links.items() if p not in routes and not p.startswith('/api/')]
missing_assets=[{'path':p,'from':sorted(r)[:4]} for p,r in assets.items() if not (root/'public'/p.lstrip('/')).is_file()]
report={'routes':len(routes),'byLanguage':dict(collections.Counter(r['lang'] for r in routes.values())),
 'uniqueLocalLinks':len(links),'uniqueAssets':len(assets),'missingRoutes':missing_links,'missingAssets':missing_assets}
(root/'src/content/howtolivebetter/routes.json').write_text(json.dumps(list(routes.values()),ensure_ascii=False,indent=2),encoding='utf8')
(root/'docs/research/howtolivebetter/route-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(1 if missing_links or missing_assets else 0)
