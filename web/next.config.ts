import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["leaflet", "react-leaflet", "react-leaflet-cluster"],
  async rewrites() {
    // Proxy /api/* to FastAPI over the internal Docker network.
    // Locally: browser calls localhost:13002/api/* → Next.js forwards
    // to api:8000 server-side → no CORS, no build-time env vars needed.
    // Production (behind nginx): nginx can route /api/* directly to the
    // api container's published port instead, this rewrite is then
    // never reached.
    return [
      {
        source: "/api/:path*",
        destination: "http://api:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
