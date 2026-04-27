import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sembunyikan header `X-Powered-By: Next.js` di response.
  poweredByHeader: false,

  // Note: Di Next.js 16, build production by default akan gagal kalau
  // ada lint atau type error (tidak perlu set eksplisit lagi).

  // Header keamanan default untuk semua route.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
