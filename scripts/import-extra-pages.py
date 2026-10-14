"""Capture registered utility routes that do not appear in the sitemap."""
import importlib.util, json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
spec=importlib.util.spec_from_file_location('import_site',Path(__file__).with_name('import-site.py'))
site=importlib.util.module_from_spec(spec);spec.loader.exec_module(site)
base=['/auth-callback','/bingo/share','/blog','/checkup/plans','/checkup/report',
 '/dashboard','/forgot-password','/lab/new','/lab/review','/layoff/pack','/pricing',
 '/quiz/share','/redeem-invite','/reset-password','/sign-in','/sign-up','/together',
 '/top-50/share','/verify-email','/wechat-login','/wechat-nickname']
routes=base+[f'/{locale}{route}' for locale in ['en','ru','es','ja','vi'] for route in base if not route.startswith(('/lab','/layoff','/together'))]
errors=[]
with ThreadPoolExecutor(max_workers=4) as pool:
    jobs={pool.submit(site.import_page,route):route for route in routes}
    for task in as_completed(jobs):
        try: task.result()
        except Exception as error: errors.append({'route':jobs[task],'error':str(error)})
with ThreadPoolExecutor(max_workers=4) as pool:
    jobs={pool.submit(site.download_asset,url):url for url in site.assets}
    for task in as_completed(jobs):
        try: task.result()
        except Exception as error: errors.append({'asset':jobs[task],'error':str(error)})
(site.ROOT/'docs/research/howtolivebetter/extra-route-errors.json').write_text(json.dumps(errors,ensure_ascii=False,indent=2),encoding='utf8')
print('Extra routes checked:',len(routes),'errors:',len(errors),flush=True)
