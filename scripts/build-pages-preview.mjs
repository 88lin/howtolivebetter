import { cp, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staging = path.resolve(root, ".tmp", "pages-preview");
const marker = ".how-pages-preview";
const basePath = process.env.PAGES_BASE_PATH ?? "/howtolivebetter";
if (basePath !== "" && !/^\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(basePath)) {
  throw new Error("PAGES_BASE_PATH must be empty or a URL path without a trailing slash");
}

async function exists(file) {
  try { await lstat(file); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

// Pages uses full document navigation. Its inline Flight data hydrates each page;
// separate Flight files are only needed by Next's client router. Fail closed if
// a future change introduces that router, rather than publish broken navigation.
async function assertDocumentNavigation(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await assertDocumentNavigation(file);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isStringLiteral(node) && ["next/link", "next/router", "next/navigation"].includes(node.text)) {
          const declaration = node.parent;
          const bindings = ts.isImportDeclaration(declaration) && declaration.importClause?.namedBindings;
          const onlyNotFound = node.text === "next/navigation" && !declaration.importClause?.name
            && bindings && ts.isNamedImports(bindings)
            && bindings.elements.every((item) => (item.propertyName ?? item.name).text === "notFound");
          if (!onlyNotFound) throw new Error(`Pages payload pruning requires document navigation; review ${file}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
await assertDocumentNavigation(path.join(root, "src"));

// Only rebuild this tool's marked staging directory. Never move or delete source routes.
if (path.dirname(staging) !== path.join(root, ".tmp") || path.basename(staging) !== "pages-preview") {
  throw new Error("Unexpected preview workspace path");
}
if (await exists(staging)) {
  if ((await lstat(staging)).isSymbolicLink() || !(await exists(path.join(staging, marker)))) {
    throw new Error("Refusing to clear a preview directory that was not created by this script");
  }
  await rm(staging, { recursive: true });
}
await mkdir(staging, { recursive: true });
await writeFile(path.join(staging, marker), "how-pages-preview-v1\n");

console.log("Preparing isolated static preview at", staging);
await cp(path.join(root, "src"), path.join(staging, "src"), {
  recursive: true,
  filter: (source) => {
    const relative = path.relative(path.join(root, "src"), source).split(path.sep).join("/");
    return relative !== "app/api" && relative !== "lib/local-store.ts";
  },
});
await cp(path.join(root, "public"), path.join(staging, "public"), { recursive: true });
for (const name of ["package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs"]) {
  await cp(path.join(root, name), path.join(staging, name));
}
await symlink(path.join(root, "node_modules"), path.join(staging, "node_modules"), process.platform === "win32" ? "junction" : "dir");

const pageFile = path.join(staging, "src/app/[[...slug]]/page.tsx");
const page = await readFile(pageFile, "utf8");
const dynamicSetting = 'export const dynamic = "force-dynamic";';
if (page.split(dynamicSetting).length !== 2) throw new Error("The source page's dynamic rendering setting changed; review static generation");
await writeFile(pageFile, 'import routes from "@/content/howtolivebetter/routes.json";\n' + page.replace(dynamicSetting, `export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return routes.map((route) => ({ slug: route.path.split("/").filter(Boolean) }));
}`));
await writeFile(path.join(staging, "next.config.mjs"), `export default ${JSON.stringify({
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  devIndicators: false,
  turbopack: { root },
}, null, 2)};\n`);

function localUrl(url) {
  if (!basePath || !url.startsWith("/") || url.startsWith("//") || url.startsWith(basePath + "/")) return url;
  return basePath + url;
}
async function patchStyles(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await patchStyles(file);
    else if (item.name.endsWith(".css")) {
      const css = await readFile(file, "utf8");
      await writeFile(file, css.replace(/url\((['"]?)(\/[^\s)'"\u0020]+)\1\)/g,
        (_match, quote, url) => `url(${quote}${localUrl(url)}${quote})`));
    }
  }
}
await patchStyles(path.join(staging, "public"));

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build"], {
    cwd: staging,
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_STATIC_PREVIEW: "true", NEXT_PUBLIC_SITE_BASE_PATH: basePath },
  });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Static preview build exited with code ${code}`)));
});

const output = path.join(staging, "out");
const routes = JSON.parse(await readFile(path.join(root, "src/content/howtolivebetter/routes.json"), "utf8"));
for (const route of routes) {
  const target = path.join(output, route.path.replace(/^\//, ""), "index.html");
  if (!(await exists(target))) throw new Error(`Missing static route: ${route.path}`);
  if (!(await readFile(target, "utf8")).includes("self.__next_f.push")) {
    throw new Error(`Missing inline hydration payload: ${route.path}`);
  }
}

let removedBytes = 0;
async function pruneNavigationPayloads(directory, inSegment = false) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in Pages artifact: ${file}`);
    // Never touch copied public assets or the JavaScript/CSS needed to hydrate.
    if (directory === output && (entry.name === "_next" || await exists(path.join(root, "public", entry.name)))) continue;
    const segment = inSegment || entry.name.startsWith("__next.");
    if (entry.isDirectory()) await pruneNavigationPayloads(file, segment);
    else if (entry.name.endsWith(".txt") && (segment || (entry.name === "index.txt" && await exists(path.join(directory, "index.html"))))) {
      removedBytes += (await lstat(file)).size;
      await rm(file);
    }
  }
}
await pruneNavigationPayloads(output);
console.log(`Removed ${(removedBytes / 1024 / 1024).toFixed(1)} MiB of unused client-navigation payloads; inline hydration is preserved`);
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(path.join(output, "preview.json"), JSON.stringify({ mode: "frontend-preview", basePath, routes: routes.length }, null, 2));

let bytes = 0;
async function totalSize(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in Pages artifact: ${file}`);
    if (entry.isDirectory()) await totalSize(file);
    else bytes += (await lstat(file)).size;
  }
}
await totalSize(output);
if (bytes > 950 * 1024 * 1024) throw new Error("Preview exceeds the safe GitHub Pages size budget (950 MiB)");
console.log(`Static preview ready: ${routes.length} routes, ${(bytes / 1024 / 1024).toFixed(1)} MiB, base path ${basePath || "/"}`);
console.log(output);
