import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["leaflet", "react-leaflet", "react-leaflet-cluster"],
  async rewrites() {
    // Proxy /api/* to FastAPI over the internal Docker network.
    // Locally (no Caddy): browser calls localhost:13002/api/* → Next.js forwards
    // to api:8000 server-side → no CORS, no build-time env vars needed.
    // Production (with Caddy): Caddy routes /api/* directly to api:8000,
    // this rewrite is never reached.
    return [
      {
        source: "/api/:path*",
        destination: "http://api:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
