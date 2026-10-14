import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

export interface DocumentNode {
  tag: string;
  props: Record<string, string | number | boolean | Record<string, string>>;
  children: Array<DocumentNode | string>;
}
export interface SitePage {
  path: string;
  title: string;
  description: string;
  lang: string;
  styles: string[];
  bodyClass: string;
  nodes: Array<DocumentNode | string>;
}
export const getSitePage = cache(async (segments: string[] = []): Promise<SitePage | null> => {
  if (segments.some((segment) => !/^[\p{L}\p{N}_\-.]+$/u.test(segment) || segment === "..")) return null;
  const file = segments.length ? segments.join("~") : "index";
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "src/content/howtolivebetter/pages", `${file}.json`), "utf8")) as SitePage;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
});
