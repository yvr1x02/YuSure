import type { NextConfig } from "next";

const isPreview = process.env.VERCEL_ENV === "preview";
const isDev = process.env.NODE_ENV === "development";

// Fixed CSP, without a nonce, so pages stay static (decided in M3, ADR-0004 unchanged).
// 'unsafe-inline' in script-src: Next writes inline scripts, and only a nonce would avoid it.
// The Vercel Toolbar is allowed on previews only (vercel.com/docs/vercel-toolbar/managing-toolbar).
const toolbar = (...sources: string[]) => (isPreview ? sources : []);
const csp = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), ...toolbar("https://vercel.live")],
  "style-src": ["'self'", "'unsafe-inline'", ...toolbar("https://vercel.live")],
  "img-src": ["'self'", "data:", "blob:", ...toolbar("https://vercel.live", "https://vercel.com")],
  "font-src": ["'self'", ...toolbar("https://vercel.live", "https://assets.vercel.com")],
  "connect-src": ["'self'", ...toolbar("https://vercel.live", "wss://ws-us3.pusher.com")],
  "frame-src": ["'self'", ...toolbar("https://vercel.live")],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

// The headers YuSure checks on other sites. HSTS comes from Vercel.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: Object.entries(csp)
      .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
      .join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
