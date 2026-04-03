"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const redirectWithStatus = (value: string) => redirect(`/device-requests?status=${encodeURIComponent(value)}`);
const redirectWithError = (value: string) => redirect(`/device-requests?error=${encodeURIComponent(value)}`);

export async function approveDeviceRequest(formData: FormData) {
  const { userId: adminUserId } = await requireAdminRole();
  if (!adminUserId) {
    redirectWithError("yetki");
  }

  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) {
    redirectWithError("request");
  }

  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data: requestRow } = await supabase
    .from("device_verifications")
    .select("id, user_id, device_token_hash, device_label, user_agent, browser, platform, requested_ip, expires_at, used_at, approved_at")
    .eq("id", requestId)
    .maybeSingle();

  if (!requestRow || requestRow.used_at || requestRow.expires_at <= nowIso) {
    redirectWithError("request-expired");
  }

  const row = requestRow!;

  await supabase.from("trusted_devices").upsert(
    {
      user_id: row.user_id,
      device_token_hash: row.device_token_hash,
      device_label: row.device_label,
      user_agent: row.user_agent,
      browser: row.browser,
      platform: row.platform,
      last_ip: row.requested_ip,
      approved_at: nowIso,
      last_seen_at: nowIso,
      revoked_at: null,
      updated_at: nowIso,
    },
    { onConflict: "user_id,device_token_hash" }
  );

  await supabase
    .from("device_verifications")
    .update({ approved_at: nowIso, approved_by: adminUserId })
    .eq("id", requestId);

  revalidatePath("/device-requests");
  redirectWithStatus("approved");
}

export async function rejectDeviceRequest(formData: FormData) {
  await requireAdminRole();
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) {
    redirectWithError("request");
  }

  const supabase = createSupabaseAdminClient();
  await supabase.from("device_verifications").delete().eq("id", requestId);
  revalidatePath("/device-requests");
  redirectWithStatus("rejected");
}

export async function revokeTrustedDeviceByAdmin(formData: FormData) {
  await requireAdminRole();
  const deviceId = String(formData.get("device_id") ?? "");
  if (!deviceId) {
    redirectWithError("device");
  }

  const supabase = createSupabaseAdminClient();
  await supabase
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", deviceId);

  revalidatePath("/device-requests");
  redirectWithStatus("revoked");
}
