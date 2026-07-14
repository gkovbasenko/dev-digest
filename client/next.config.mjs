import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  webpack(config) {
    // tsconfig's moduleResolution:"Bundler" lets tsc/vitest resolve a `.js`
    // specifier (e.g. `./findings.js`) to its `.ts` source — webpack has no
    // matching default, so any `.ts` file importing a sibling via a `.js`
    // specifier (every file under vendor/shared/contracts) fails to bundle
    // with "Module not found" the moment it's pulled in as a runtime value,
    // even though typecheck/tests stay green.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
