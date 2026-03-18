import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Disable React Strict Mode to work around a React 19 core bug
  // (facebook/react#33580) where conditional `use(thenable)` inside
  // Next.js Router's useActionQueue causes "Rendered more hooks than
  // during the previous render". Strict Mode's double-render in dev
  // triggers the timing conditions that expose the bug.
  // This has zero effect on production builds.
  // TODO: Re-enable once React merges the fix (facebook/react#35717).
  reactStrictMode: false,
};
export default withNextIntl(withBundleAnalyzer(nextConfig));
