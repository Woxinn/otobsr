import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hashDeviceToken, TRUSTED_DEVICE_COOKIE } from "@/lib/trusted-device";

type UserRole = "Admin" | "Yonetim" | "Satis";

const normalizeRole = (value: string | null | undefined): UserRole => {
  const raw = (value ?? "").toLowerCase();
  if (raw === "yonetim") return "Yonetim";
  if (raw === "satis") return "Satis";
  return "Admin";
};

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const returnTo = pathname + (search ?? "");
  const bypassTrustedDevice =
    pathname === "/device-check" ||
    pathname.startsWith("/device-approve") ||
    pathname.startsWith("/api/auth/device/");

  if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/mssql-bridge/agent/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/resend/inbound") || pathname.startsWith("/api/insurance-mail/ingest")) {
    return NextResponse.next();
  }

  const hasAccessToken = request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("auth-token"));

  if (pathname === "/login") {
    if (hasAccessToken) {
      const nextPath = request.nextUrl.searchParams.get("returnTo") ?? "/";
      return NextResponse.redirect(new URL(nextPath, request.url));
    }
    return NextResponse.next();
  }

  if (!hasAccessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl);
  }

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
      const allowedForSales =
        pathname.startsWith("/orders") ||
        pathname.startsWith("/products") ||
        pathname.startsWith("/account") ||
        pathname === "/device-check" ||
        pathname.startsWith("/device-approve") ||
        pathname.startsWith("/api/auth/device/");

      if (!allowedForSales) {
        return NextResponse.redirect(new URL("/orders", request.url));
      }
    }

    if (!bypassTrustedDevice) {
      const trustedToken = request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value ?? null;
      let trusted = false;

      if (trustedToken) {
        const trustedHash = await hashDeviceToken(trustedToken);
        const { data: trustedDevice } = await supabase
          .from("trusted_devices")
          .select("id")
          .eq("user_id", user.id)
          .eq("device_token_hash", trustedHash)
          .is("revoked_at", null)
          .maybeSingle();

        trusted = Boolean(trustedDevice);
      }

      if (!trusted) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Bu cihaz henüz doğrulanmadı." }, { status: 403 });
        }

        const deviceUrl = new URL("/device-check", request.url);
        deviceUrl.searchParams.set("returnTo", returnTo);
        return NextResponse.redirect(deviceUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api/mssql-bridge/agent|_next/static|_next/image|favicon.ico|templates).*)"],
};
