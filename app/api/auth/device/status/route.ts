import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashDeviceToken, PENDING_DEVICE_COOKIE } from "@/lib/trusted-device";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const pendingToken = request.cookies.get(PENDING_DEVICE_COOKIE)?.value ?? null;
  if (!pendingToken) {
    return NextResponse.json({ status: "missing" });
  }

  const tokenHash = await hashDeviceToken(pendingToken);
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: verification } = await supabase
    .from("device_verifications")
    .select("id, return_to, expires_at, approved_at")
    .eq("user_id", user.id)
    .eq("device_token_hash", tokenHash)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!verification) {
    return NextResponse.json({ status: "missing" });
  }

  const expiresAt = new Date(verification.expires_at);
  const secondsRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));

  if (verification.expires_at <= nowIso) {
    return NextResponse.json({
      status: "expired",
      expiresAt: verification.expires_at,
      secondsRemaining: 0,
    });
  }

  if (verification.approved_at) {
    return NextResponse.json({
      status: "approved",
      expiresAt: verification.expires_at,
      secondsRemaining,
      returnTo: verification.return_to ?? "/",
    });
  }

  return NextResponse.json({
    status: "pending",
    expiresAt: verification.expires_at,
    secondsRemaining,
  });
}
