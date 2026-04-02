import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type UserRole = "Admin" | "Yonetim" | "Satis";

const normalizeRole = (value: string | null | undefined): UserRole => {
  const raw = (value ?? "").toLowerCase();
  if (raw === "yonetim") return "Yonetim";
  if (raw === "satis") return "Satis";
  return "Admin";
};

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/mssql-bridge/agent/")) {
    return NextResponse.next();
  }

  const hasAccessToken = request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("auth-token"));

  if (pathname === "/login") {
    if (hasAccessToken) {
      const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";
      return NextResponse.redirect(new URL(returnTo, request.url));
    }
    return NextResponse.next();
  }

  if (!hasAccessToken) {
    const loginUrl = new URL("/login", request.url);
    const returnTo = pathname + (search ?? "");
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl);
  }

  if (!pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      const role = normalizeRole(roleRow?.role);
      if (role === "Satis") {
        const allowedForSales = pathname.startsWith("/orders") || pathname.startsWith("/products");

        if (!allowedForSales) {
          return NextResponse.redirect(new URL("/orders", request.url));
        }
      }
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/mssql-bridge/agent|_next/static|_next/image|favicon.ico|templates).*)"],
};
