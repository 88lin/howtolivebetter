import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  devIndicators: false,
  outputFileTracingIncludes: { "/*": ["./src/content/howtolivebetter/pages/**/*.json"] },
};

export default nextConfig;
