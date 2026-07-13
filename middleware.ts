import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/forgot-password", "/reset-password", "/auth/callback", "/pricing", "/terms", "/privacy"];
const PUBLIC_PREFIXES = [
  "/q/",
  "/api/quotes/public/",
  "/request/",
  "/api/request/",
  "/api/stripe/webhook",
  "/api/cron/",
];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (isPublic) return NextResponse.next();

  // Check for a Supabase auth session cookie
  const cookies = request.cookies.getAll();
  const hasSession = cookies.some(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
