"""Check imported routes (or just the source sitemap) on a local server."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html import unescape
from http.client import HTTPConnection, HTTPSConnection
import json
from pathlib import Path
import re
import threading
from urllib.parse import quote, urlsplit
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base-url", default="http://127.0.0.1:3000")
parser.add_argument("--scope", choices=["all", "sitemap"], default="all")
args = parser.parse_args()
base = args.base_url.rstrip("/")
address = urlsplit(base)
if address.scheme not in ("http", "https") or address.hostname not in ["localhost", "127.0.0.1", "::1"]:
    parser.error("Only local test servers are allowed")

root = Path(__file__).resolve().parents[1]
research = root / "docs/research/howtolivebetter"
index = json.loads((root / "src/content/howtolivebetter/routes.json").read_text(encoding="utf8"))
titles = {entry["path"]: entry["title"] for entry in index}
sitemap = {
    urlsplit(entry.text).path
    for entry in ET.parse(research / "sitemap.xml").findall("{*}url/{*}loc")
}
routes = sorted(set(titles) | sitemap if args.scope == "all" else sitemap)
workers = threading.local()
connections = []


def check(route):
    try:
        # Reuse one connection per worker; thousands of short-lived sockets can
        # exhaust Windows' ephemeral ports before TIME_WAIT expires.
        if not getattr(workers, "connection", None):
            connection_type = HTTPSConnection if address.scheme == "https" else HTTPConnection
            workers.connection = connection_type(address.hostname, address.port, timeout=90)
            connections.append(workers.connection)
        workers.connection.request("GET", address.path.rstrip("/") + quote(route, safe="/"))
        response = workers.connection.getresponse()
        body = response.read().decode("utf8")
        match = re.search(r"<title>(.*?)</title>", body, re.DOTALL)
        title = unescape(match.group(1)) if match else None
        result = {"route": route, "status": response.status}
        if title is None or (route in titles and title != titles[route]):
            result.update(error="Unexpected page title", title=title, expected=titles.get(route))
        return result
    except Exception as error:
        if getattr(workers, "connection", None):
            workers.connection.close()
            workers.connection = None
        return {"route": route, "error": str(error)}


results = []
with ThreadPoolExecutor(max_workers=4) as pool:
    futures = [pool.submit(check, route) for route in routes]
    for future in as_completed(futures):
        results.append(future.result())
        if len(results) % 250 == 0:
            print(f"Checked {len(results)} / {len(routes)} routes", flush=True)
for connection in connections:
    connection.close()

failures = sorted(
    (result for result in results if result.get("status") != 200 or "error" in result),
    key=lambda result: result["route"],
)
report = {
    "checkedAt": datetime.now(timezone.utc).isoformat(),
    "baseUrl": base,
    "scope": args.scope,
    "indexedRoutes": len(titles),
    "sitemapRoutes": len(sitemap),
    "tested": len(results),
    "passed": len(results) - len(failures),
    "failures": failures,
}
(research / "route-http-check.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(1 if failures else 0)
