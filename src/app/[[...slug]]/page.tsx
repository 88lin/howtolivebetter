import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSitePage } from "@/lib/site-content";
import { SiteDocument } from "@/components/sites/howtolivebetter/site-document";
import { SiteRuntime } from "@/components/sites/howtolivebetter/site-runtime";
import { sitePath } from "@/lib/site-path";

export const dynamic = "force-dynamic";
interface PageProps { params: Promise<{ slug?: string[] }> }
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = await getSitePage((await params).slug);
  return page ? { title: page.title, description: page.description } : { title: "页面未找到" };
}
export default async function Page({ params }: PageProps) {
  const page = await getSitePage((await params).slug);
  if (!page) notFound();
  return <>
    {page.styles.map((href) => <link key={href} rel="stylesheet" href={sitePath(href)} precedence="site" />)}
    <SiteRuntime route={page.path} lang={page.lang}><SiteDocument nodes={page.nodes} /></SiteRuntime>
  </>;
}
