import type { NextConfig } from "next";

/**
 * The Express API has no CORS middleware, so the browser talks to it through
 * this same-origin rewrite proxy instead of calling the API origin directly.
 * The upstream origin is resolved server-side at config time and never ships
 * to client JavaScript.
 */
const API_ORIGIN = process.env["API_PROXY_ORIGIN"] ?? "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_ORIGIN}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
