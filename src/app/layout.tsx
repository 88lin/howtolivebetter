import type { Metadata } from "next";
import { isStaticPreview, sitePath } from "@/lib/site-path";
import "./globals.css";

export const metadata: Metadata = {
  title: "高性价比人生指南",
  description: "用最少的钱、时间和精力，换回寿命、金钱和自由。",
  icons: { icon: sitePath("/sites/howtolivebetter/favicon.svg") },
  ...(isStaticPreview ? { robots: { index: false, follow: false } } : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
