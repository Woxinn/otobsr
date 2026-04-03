import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hashDeviceToken,
  normalizeReturnTo,
  PENDING_DEVICE_COOKIE,
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_MAX_AGE_SECONDS,
} from "@/lib/trusted-device";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const pendingToken = request.cookies.get(PENDING_DEVICE_COOKIE)?.value ?? null;
  if (!pendingToken) {
    return NextResponse.json({ error: "Bekleyen cihaz çerezi bulunamadı." }, { status: 400 });
  }

  const tokenHash = await hashDeviceToken(pendingToken);
  const nowIso = new Date().toISOString();
  const { data: trustedDevice } = await supabase
    .from("trusted_devices")
    .select("id")
    .eq("user_id", user.id)
    .eq("device_token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (!trustedDevice) {
    return NextResponse.json({ error: "Cihaz henüz onaylanmadı." }, { status: 403 });
  }

  const { data: verification } = await supabase
    .from("device_verifications")
    .select("id, return_to, expires_at, approved_at")
    .eq("user_id", user.id)
    .eq("device_token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .not("approved_at", "is", null)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (!verification) {
    return NextResponse.json({ error: "Geçerli onay bulunamadı." }, { status: 403 });
  }

  const returnTo = normalizeReturnTo(verification.return_to ?? "/");
  await supabase.from("device_verifications").update({ used_at: nowIso }).eq("id", verification.id);

  await supabase
    .from("trusted_devices")
    .update({ last_seen_at: nowIso, updated_at: nowIso })
    .eq("id", trustedDevice.id);

  const secure = request.nextUrl.protocol === "https:";
  const response = NextResponse.json({ status: "ok", returnTo });
  response.cookies.set(TRUSTED_DEVICE_COOKIE, pendingToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
  });
  response.cookies.set(PENDING_DEVICE_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
