import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // /careers/embed and the public /api/careers* routes get permissive
        // headers so they can be iframed / fetched from convertt.co (and
        // anywhere else). Everything else keeps the default protections.
        source: '/careers/embed/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors *;" },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      },
      {
        source: '/api/careers/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
          { key: 'Cache-Control', value: 'public, max-age=60, s-maxage=300' },
        ],
      },
    ]
  },
}

export default nextConfig
