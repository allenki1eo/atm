import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "@libsql/client"],
};

// Only apply Serwist PWA in production or when explicitly enabled
const withSerwist = async () => {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_PWA === "true") {
    try {
      const { default: withSerwistPlugin } = await import("@serwist/next");
      const plugin = withSerwistPlugin({
        swSrc: "app/sw.ts",
        swDest: "public/sw.js",
        additionalPrecacheEntries: [],
        disable: false,
      });
      return plugin(nextConfig);
    } catch {
      return nextConfig;
    }
  }
  return nextConfig;
};

export default withSerwist();
