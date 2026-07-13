// Middleware disabled — Next.js bundles @next/env into the Edge runtime which
// references __dirname (unavailable on Vercel Edge). Auth is enforced
// client-side in each page and server-side in each API route.
export function middleware() {}
export const config = { matcher: [] };
