/** GitHub Pages previews live below a repository path; full servers use the root. */
export const siteBasePath = process.env.NEXT_PUBLIC_SITE_BASE_PATH || "";
export const isStaticPreview = process.env.NEXT_PUBLIC_STATIC_PREVIEW === "true";

export function sitePath(value: string): string {
  if (!siteBasePath || !value.startsWith("/") || value.startsWith("//")) return value;
  if (value === siteBasePath || value.startsWith(`${siteBasePath}/`) || value.startsWith(`${siteBasePath}?`) || value.startsWith(`${siteBasePath}#`)) return value;
  return siteBasePath + value;
}

export function siteCss(value: string): string {
  return value.replace(/url\((['"]?)(\/[^\s)'"]+)\1\)/g, (_match, quote: string, url: string) => `url(${quote}${sitePath(url)}${quote})`);
}

export function siteSrcSet(value: string): string {
  if (!siteBasePath || value.trim().startsWith("data:")) return value;
  return value.split(",").map((candidate) => candidate.trim().replace(/^\S+/, sitePath)).join(", ");
}
