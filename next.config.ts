import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the app import claude/SETUP.md as text, so the setup checklist always copies the current prompt.
  webpack(config) {
    config.module.rules.push({ test: /\.md$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
