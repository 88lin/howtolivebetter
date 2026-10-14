import { createElement, type ReactNode } from "react";
import type { DocumentNode } from "@/lib/site-content";
import { siteCss, sitePath, siteSrcSet } from "@/lib/site-path";

const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "param", "source", "track", "wbr"]);
const skippedTags = new Set(["script", "iframe", "object", "embed"]);

/** Editable semantic nodes; source scripts are never executed or included. */
export function renderDocumentNode(node: DocumentNode | string, key: number | string): ReactNode {
  if (typeof node === "string") return node;
  if (skippedTags.has(node.tag)) return null;
  // The source removes the duplicate SSR privacy control after its footer mounts.
  if (node.props.className === "privacy-control") return null;
  const props: Record<string, unknown> = { ...node.props, key };
  for (const name of ["href", "src", "poster"]) {
    if (typeof props[name] === "string") props[name] = sitePath(props[name]);
  }
  if (typeof props.srcSet === "string") props.srcSet = siteSrcSet(props.srcSet);
  if (props.style && typeof props.style === "object") {
    props.style = Object.fromEntries(Object.entries(props.style).map(([name, value]) => [name, typeof value === "string" ? siteCss(value) : value]));
  }
  if (props.inert === "") props.inert = true;
  if ("checked" in props) { props.defaultChecked = props.checked; delete props.checked; }
  if ("value" in props && ["input", "textarea", "select"].includes(node.tag)) { props.defaultValue = props.value; delete props.value; }
  if (node.tag === "option") delete props.selected;
  if (node.tag === "form") { delete props.action; props.method = "dialog"; }
  if (voidTags.has(node.tag)) return createElement(node.tag, props);
  if (node.tag === "textarea") {
    props.defaultValue ??= node.children.filter((child) => typeof child === "string").join("");
    return createElement(node.tag, props);
  }
  return createElement(node.tag, props, ...node.children.map((child, index) => renderDocumentNode(child, index)));
}
export function SiteDocument({ nodes }: { nodes: Array<DocumentNode | string> }) {
  return <>{nodes.map((node, index) => renderDocumentNode(node, index))}</>;
}
