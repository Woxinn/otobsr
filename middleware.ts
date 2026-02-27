import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Supabase auth çerezleri project ref'e göre isimlenir (örn. sb-<ref>-auth-token).
  const hasAccessToken = request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("auth-token"));

  // Login sayfasında ve zaten oturum varsa anasayfaya/returnTo'ya gönder
  if (pathname === "/login") {
    if (hasAccessToken) {
      const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";
      return NextResponse.redirect(new URL(returnTo, request.url));
    }
    return NextResponse.next();
  }

  // Supabase auth çerezi yoksa login'e yönlendir
  if (!hasAccessToken) {
    const loginUrl = new URL("/login", request.url);
    const returnTo = pathname + (search ?? "");
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|templates).*)"],
};
