import type { NextConfig } from "next";

// Files the server reads with fs at request time. Vercel only ships traced files,
// so list them here or pages and API routes will find nothing in production.
const runtimeData = [
  "./fixtures/**/*",
  "./results/*/*.json",
  "./results-archive/*/*/*.json",
  "./public/tikz-fonts/**/*",
  "./node_modules/node-tikzjax/**/*",
];

const nextConfig: NextConfig = {
  // node-tikzjax loads its TeX WebAssembly + core dump from its own package dir at runtime.
  serverExternalPackages: ["node-tikzjax", "@resvg/resvg-js"],
  outputFileTracingIncludes: {
    "/": runtimeData,
    "/p/*": runtimeData,
    "/try": runtimeData,
    "/how-it-works": runtimeData,
    "/api/*": runtimeData,
  },
  // Attempt pictures and working files are records for review, not read by the site.
  outputFileTracingExcludes: {
    "/*": ["./results/*/work/**", "./results-archive/**/work/**", "./results-archive/**/*.txt"],
    "/p/*": ["./results/*/work/**", "./results-archive/**/work/**"],
    "/api/*": ["./results/*/work/**", "./results-archive/**/work/**"],
  },
};

export default nextConfig;
