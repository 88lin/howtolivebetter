import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = path.join(root, "src/content/howtolivebetter/pages");
const routesFile = path.join(root, "src/content/howtolivebetter/routes.json");
const assetMapFile = path.join(root, "docs/research/howtolivebetter/asset-map.json");
const sponsoredAssets = path.join(root, "public/sites/howtolivebetter/images/shengcai");
const checkOnly = process.argv.includes("--check");

function isAdvertisingRoute(route) {
  const pathname = String(route).split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return ["advertise", "shengcaiyoushu"].includes(pathname.split("/").at(-1));
}

function hasAdvertisingLink(value) {
  if (Array.isArray(value)) return value.some(hasAdvertisingLink);
  if (!value || typeof value !== "object") return false;
  if (isAdvertisingRoute(value.props?.href ?? "")) return true;
  return Object.values(value).some(hasAdvertisingLink);
}

function cleanNode(value) {
  if (Array.isArray(value)) return value.flatMap(cleanNode);
  if (!value || typeof value !== "object") return [value];

  const props = value.props ?? {};
  const classes = String(props.className ?? "").split(/\s+/);
  const placement = Object.keys(props).some((key) => key.startsWith("data-ad-"));
  if (classes.includes("life-ad-layout")) {
    const children = cleanNode(value.children);
    const main = children.find((child) => child && typeof child === "object" && child.tag === "main");
    if (!main) throw new Error("An advertising layout no longer contains its expected main element");
    return [main];
  }
  if (placement || classes.some((name) => name.startsWith("life-ad-"))) return [];

  return [{ ...value, children: cleanNode(value.children) }];
}

const routes = JSON.parse(await readFile(routesFile, "utf8"));
const keptRoutes = routes.filter((route) => !isAdvertisingRoute(route.path));
const removedRoutes = routes.filter((route) => isAdvertisingRoute(route.path));
if (checkOnly && removedRoutes.length) throw new Error(`${removedRoutes.length} advertising routes remain`);
if (checkOnly) {
  try {
    await stat(sponsoredAssets);
    throw new Error("Advertising-only image assets remain");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const assetMap = JSON.parse(await readFile(assetMapFile, "utf8"));
  if (assetMap.some((asset) => asset.local.replaceAll("\\", "/").includes("/images/shengcai/"))) {
    throw new Error("Advertising-only asset records remain");
  }
}

let cleanedPages = 0;
let removedPlacements = 0;
for (const entry of await readdir(pagesDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
  const file = path.join(pagesDir, entry.name);
  const page = JSON.parse(await readFile(file, "utf8"));
  if (isAdvertisingRoute(page.path)) {
    if (checkOnly) throw new Error(`Advertising page remains: ${page.path}`);
    const expected = path.resolve(pagesDir, path.basename(routeFile(page.path)));
    if (expected !== file) throw new Error(`Unexpected advertising page path: ${file}`);
    await rm(file);
    continue;
  }
  const before = JSON.stringify(page.nodes);
  const nextNodes = cleanNode(page.nodes);
  const after = JSON.stringify(nextNodes);
  if (hasAdvertisingLink(nextNodes)) throw new Error(`A removed advertising route is still linked from ${page.path}`);
  if (before !== after) {
    if (checkOnly) throw new Error(`Advertising content remains: ${page.path}`);
    removedPlacements += (before.match(/data-ad-placement/g) ?? []).length;
    page.nodes = nextNodes;
    await writeFile(file, JSON.stringify(page));
    cleanedPages++;
  }
  if (after.includes("data-ad-") || after.includes("life-ad-space") || after.includes("life-advertise")) {
    throw new Error(`Advertising marker remains: ${page.path}`);
  }
}

if (!checkOnly) {
  await writeFile(routesFile, `${JSON.stringify(keptRoutes, null, 2)}\n`);
  const assetMap = JSON.parse(await readFile(assetMapFile, "utf8"));
  const keptAssets = assetMap.filter((asset) => !asset.local.replaceAll("\\", "/").includes("/images/shengcai/"));
  await writeFile(assetMapFile, `${JSON.stringify(keptAssets, null, 2)}\n`);

  try {
    const target = path.resolve(sponsoredAssets);
    if (path.dirname(target) !== path.join(root, "public/sites/howtolivebetter/images") || !(await stat(target)).isDirectory()) {
      throw new Error("Refusing to remove an unexpected advertising asset directory");
    }
    await rm(target, { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

console.log(`${checkOnly ? "No advertising content found" : `Removed ${removedPlacements} placements from ${cleanedPages} pages and ${removedRoutes.length} advertising routes`}`);

function routeFile(route) {
  return `${route === "/" ? "index" : route.replace(/^\//, "").replaceAll("/", "~")}.json`;
}
