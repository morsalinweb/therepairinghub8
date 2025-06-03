/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["mongoose"],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    domains: ['localhost', 'your-domain.com'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      }
    }
    return config
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "connect-src 'self' ws: wss: https://*.clerk.accounts.dev https://*.clerk.com https://clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com https://api.clerk.com https://*.api.clerk.com https://challenges.cloudflare.com https://*.cloudflare.com",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.com https://api.clerk.com https://challenges.cloudflare.com https://*.cloudflare.com https://static.cloudflareinsights.com",
              "script-src-elem 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.com https://api.clerk.com https://challenges.cloudflare.com https://*.cloudflare.com https://static.cloudflareinsights.com",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://*.cloudflare.com",
              "img-src 'self' data: https://*.clerk.accounts.dev https://*.clerk.com https://img.clerk.com https://challenges.cloudflare.com https://*.cloudflare.com",
              "font-src 'self' data:",
              "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://*.cloudflare.com",
              "child-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://*.cloudflare.com",
            ].join("; "),
          },
        ],
      },
      {
        source: '/api/payments/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, stripe-signature',
          },
        ],
      },
    ]
  },
  // Ensure webhooks work in production
  async rewrites() {
    return [
      {
        source: '/api/payments/stripe/webhook',
        destination: '/api/payments/stripe/webhook',
      },
      {
        source: '/api/payments/paypal/webhook',
        destination: '/api/payments/paypal/webhook',
      },
    ]
  },
}

export default nextConfig
