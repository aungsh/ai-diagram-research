import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-tikzjax loads its TeX WebAssembly + core dump from its own package dir at runtime.
  serverExternalPackages: ["node-tikzjax", "@resvg/resvg-js"],
};

export default nextConfig;
