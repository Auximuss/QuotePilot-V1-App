import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const isMarketingDomain =
    host === "demandpilot.co.uk" || host === "www.demandpilot.co.uk";

  if (request.nextUrl.pathname === "/" && isMarketingDomain) {
    return NextResponse.rewrite(new URL("/index.html", request.url));
  }
}

export const config = {
  matcher: ["/"],
};
