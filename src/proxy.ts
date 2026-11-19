import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/api/auth/login") ||
    pathname === "/api/health" ||
    (pathname === "/api/cron/sync" && req.method === "POST") ||
    (pathname.startsWith("/api/auth/session") && req.method === "POST")
  ) {
    return NextResponse.next();
  }
  const token = req.cookies.get("gluck_session")?.value;
  if (pathname.startsWith("/api/")) {
    if (!token) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    return NextResponse.next();
  }
  if (!token && pathname !== "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (token && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$).*)"],
};
