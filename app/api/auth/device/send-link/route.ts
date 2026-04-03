import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createDeviceToken,
  describeDevice,
  DEVICE_VERIFICATION_TTL_MINUTES,
  hashDeviceToken,
  normalizeReturnTo,
  PENDING_DEVICE_COOKIE,
} from "@/lib/trusted-device";
import { buildAdminDeviceRequestEmail, sendResendEmail } from "@/lib/resend";

const devErrorPayload = (message: string, detail?: unknown) => {
  if (process.env.NODE_ENV !== "production") {
    return { error: message, detail: String(detail ?? "") };
  }
  return { error: message };
};

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const adminSupabase = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { returnTo?: string };
  const returnTo = normalizeReturnTo(body.returnTo);
  const secure = request.nextUrl.protocol === "https:";
  const existingPendingToken = request.cookies.get(PENDING_DEVICE_COOKIE)?.value ?? null;
  const pendingToken = existingPendingToken || createDeviceToken();
  const pendingHash = await hashDeviceToken(pendingToken);
  const device = describeDevice(request.headers.get("user-agent"));
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAtIso = new Date(now.getTime() + DEVICE_VERIFICATION_TTL_MINUTES * 60 * 1000).toISOString();

  const { data: existingRequest } = await supabase
    .from("device_verifications")
    .select("id, expires_at, approved_at")
    .eq("user_id", user.id)
    .eq("device_token_hash", pendingHash)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingRequest) {
    const response = NextResponse.json({
      status: existingRequest.approved_at ? "approved" : "pending",
      expiresAt: existingRequest.expires_at,
      message: existingRequest.approved_at
        ? "Yönetici onayı verildi. Giriş tamamlanıyor..."
        : "Yönetici onayı bekleniyor.",
    });
    response.cookies.set(PENDING_DEVICE_COOKIE, pendingToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_VERIFICATION_TTL_MINUTES * 60,
    });
    return response;
  }

  const { data: trustedDevice } = await supabase
    .from("trusted_devices")
    .select("id")
    .eq("user_id", user.id)
    .eq("device_token_hash", pendingHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (trustedDevice) {
    const response = NextResponse.json({
      status: "approved",
      message: "Bu cihaz daha önce onaylanmış. Giriş tamamlanıyor...",
    });
    response.cookies.set(PENDING_DEVICE_COOKIE, pendingToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_VERIFICATION_TTL_MINUTES * 60,
    });
    return response;
  }

  await supabase
    .from("device_verifications")
    .delete()
    .eq("user_id", user.id)
    .eq("device_token_hash", pendingHash)
    .is("used_at", null);

  const { data: verificationRow, error: verificationError } = await supabase
    .from("device_verifications")
    .insert({
      user_id: user.id,
      device_token_hash: pendingHash,
      device_label: device.label,
      user_agent: device.userAgent,
      browser: device.browser,
      platform: device.platform,
      requested_ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        null,
      return_to: returnTo,
      expires_at: expiresAtIso,
    })
    .select("id, created_at, expires_at")
    .single();

  if (verificationError || !verificationRow) {
    console.error("[device-request] verification insert error", verificationError);
    return NextResponse.json(devErrorPayload("Cihaz talebi oluşturulamadı.", verificationError?.message), { status: 500 });
  }

  const { data: adminRoleRows, error: adminRoleError } = await adminSupabase
    .from("user_roles")
    .select("user_id, email")
    .eq("role", "Admin");

  if (adminRoleError) {
    console.error("[device-request] admin role lookup error", adminRoleError);
    await supabase.from("device_verifications").delete().eq("id", verificationRow.id);
    return NextResponse.json(devErrorPayload("Admin kullanıcılar okunamadı.", adminRoleError.message), {
      status: 500,
    });
  }

  const adminIdSet = new Set((adminRoleRows ?? []).map((row) => String(row.user_id ?? "")).filter(Boolean));
  const fallbackEmails = (adminRoleRows ?? []).map((row) => String(row.email ?? "").trim()).filter(Boolean);
  let adminEmails = Array.from(new Set(fallbackEmails));

  if (adminIdSet.size) {
    const { data: authUsersData, error: authUsersError } = await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    if (authUsersError) {
      console.error("[device-request] auth user lookup error", authUsersError);
    } else {
      const authEmails = (authUsersData?.users ?? [])
        .filter((authUser) => adminIdSet.has(String(authUser.id)))
        .map((authUser) => String(authUser.email ?? "").trim())
        .filter(Boolean);
      adminEmails = Array.from(new Set([...adminEmails, ...authEmails]));
    }
  }

  if (!adminEmails.length) {
    await supabase.from("device_verifications").delete().eq("id", verificationRow.id);
    return NextResponse.json(devErrorPayload("Onay verecek admin hesabı bulunamadı."), { status: 500 });
  }

  const approvalUrl = `${request.nextUrl.origin}/device-requests`;
  const requestedAtLabel = new Date(verificationRow.created_at).toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const expiresAtLabel = new Date(verificationRow.expires_at).toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const emailPayload = buildAdminDeviceRequestEmail({
    approvalUrl,
    userEmail: user.email,
    deviceLabel: device.label,
    browser: device.browser,
    platform: device.platform,
    requestedAt: requestedAtLabel,
    expiresAt: expiresAtLabel,
  });

  try {
    const results = await Promise.allSettled(
      adminEmails.map((email) =>
        sendResendEmail({
          to: email,
          subject: emailPayload.subject,
          html: emailPayload.html,
          text: emailPayload.text,
        })
      )
    );

    const successCount = results.filter((result) => result.status === "fulfilled").length;
    if (successCount === 0) {
      const firstError = results.find((result) => result.status === "rejected");
      throw new Error(
        firstError && firstError.status === "rejected"
          ? String(firstError.reason)
          : "Hiçbir admin alıcısına e-posta gönderilemedi."
      );
    }
  } catch (error) {
    console.error("[device-request] resend error", error);
    await supabase.from("device_verifications").delete().eq("id", verificationRow.id);
    return NextResponse.json(devErrorPayload("Admin bildirim e-postası gönderilemedi.", error), {
      status: 500,
    });
  }

  const response = NextResponse.json({
    status: "pending",
    expiresAt: verificationRow.expires_at,
    message: "Yönetici onayı bekleniyor. Adminlere bildirim gönderildi.",
  });

  response.cookies.set(PENDING_DEVICE_COOKIE, pendingToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_VERIFICATION_TTL_MINUTES * 60,
  });

  return response;
}
