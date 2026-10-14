"""Fetch assets for the core pages while the complete route import runs."""
import importlib.util
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
spec=importlib.util.spec_from_file_location('import_site',Path(__file__).with_name('import-site.py'))
site=importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)
for route in ['/', '/book', '/daily','/bingo','/quiz','/checkup','/meditation','/pomodoro','/value','/book/01','/articles']:
    site.import_page(route)
print('Priority assets:',len(site.assets),flush=True)
with ThreadPoolExecutor(max_workers=5) as pool:
    jobs={pool.submit(site.download_asset,url):url for url in site.assets}
    for task in as_completed(jobs):
        try: task.result()
        except Exception as error: print(jobs[task],str(error),flush=True)
print('Priority assets ready.',flush=True)
