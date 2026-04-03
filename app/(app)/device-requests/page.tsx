import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  approveDeviceRequest,
  rejectDeviceRequest,
  revokeTrustedDeviceByAdmin,
} from "@/app/actions/device-requests";

type SearchParams = Promise<{
  status?: string;
  error?: string;
}>;

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
};

const statusMessage = (value: string | undefined) => {
  if (value === "approved") return "Cihaz talebi onaylandı.";
  if (value === "rejected") return "Bekleyen cihaz talebi kaldırıldı.";
  if (value === "revoked") return "Onaylı cihaz erişimi kaldırıldı.";
  return null;
};

const errorMessage = (value: string | undefined) => {
  if (value === "yetki") return "Bu işlem için admin yetkisi gerekiyor.";
  if (value === "request") return "Geçersiz cihaz talebi.";
  if (value === "request-expired") return "Cihaz talebi bulunamadı veya süresi doldu.";
  if (value === "device") return "Geçersiz cihaz kaydı.";
  return null;
};

export default async function DeviceRequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { role } = await getCurrentUserRole();
  if (role !== "Admin") {
    redirect("/");
  }

  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const [{ data: pending }, { data: devices }, { data: users }] = await Promise.all([
    supabase
      .from("device_verifications")
      .select("id, user_id, device_label, browser, platform, requested_ip, return_to, created_at, expires_at, approved_at, used_at")
      .is("used_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("trusted_devices")
      .select("id, user_id, device_label, browser, platform, last_ip, approved_at, last_seen_at, revoked_at")
      .order("approved_at", { ascending: false }),
    supabase.from("user_roles").select("user_id, email"),
  ]);

  const userEmailById = new Map((users ?? []).map((row) => [String(row.user_id), String(row.email ?? "-")]));
  const pendingRequests = (pending ?? []).filter((row) => !row.approved_at && row.expires_at > nowIso);
  const trustedDevices = devices ?? [];

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-black/10 bg-white/90 p-6 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.28em] text-black/45">Admin cihaz yönetimi</p>
        <h1 className="mt-3 text-3xl font-semibold text-black">Bekleyen cihaz talepleri ve onaylı cihazlar</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-black/62">
          Bu ekrandan yeni cihaz taleplerini onaylayabilir, reddedebilir ve mevcut onaylı cihaz erişimlerini kaldırabilirsiniz.
        </p>
        {statusMessage(params.status) ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {statusMessage(params.status)}
          </p>
        ) : null}
        {errorMessage(params.error) ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage(params.error)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[28px] border border-black/10 bg-white/90 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-black/45">Bekleyen talepler</p>
              <h2 className="mt-2 text-xl font-semibold text-black">Onay bekleyen cihazlar</h2>
            </div>
            <span className="rounded-full border border-black/10 bg-[var(--paper)] px-3 py-1 text-xs font-semibold text-black/65">
              {pendingRequests.length} bekliyor
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {pendingRequests.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-black/10 bg-[var(--paper)]/60 px-5 py-8 text-sm text-black/55">
                Bekleyen cihaz talebi yok.
              </div>
            ) : null}
            {pendingRequests.map((request) => (
              <div key={request.id} className="rounded-3xl border border-black/10 bg-[var(--paper)]/70 p-4">
                <p className="text-base font-semibold text-black">{userEmailById.get(String(request.user_id)) ?? "-"}</p>
                <p className="mt-2 text-sm text-black/62">
                  {request.device_label} · {request.browser ?? "Tarayıcı"} / {request.platform ?? "Platform"}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-black/50 sm:grid-cols-2">
                  <p>Talep: {formatDateTime(request.created_at)}</p>
                  <p>Süre sonu: {formatDateTime(request.expires_at)}</p>
                  <p>IP: {request.requested_ip ?? "-"}</p>
                  <p>Dönüş: {request.return_to ?? "/"}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <form action={approveDeviceRequest}>
                    <input type="hidden" name="request_id" value={request.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-[linear-gradient(135deg,#133c45_0%,#1f7166_100%)] px-4 py-2 text-sm font-semibold text-white"
                    >
                      Onayla
                    </button>
                  </form>
                  <form action={rejectDeviceRequest}>
                    <input type="hidden" name="request_id" value={request.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                    >
                      Reddet
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-black/10 bg-white/90 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-black/45">Onaylı cihazlar</p>
              <h2 className="mt-2 text-xl font-semibold text-black">Kullanıcı bazlı cihaz listesi</h2>
            </div>
            <span className="rounded-full border border-black/10 bg-[var(--paper)] px-3 py-1 text-xs font-semibold text-black/65">
              {trustedDevices.filter((device) => !device.revoked_at).length} aktif
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {trustedDevices.map((device) => (
              <div key={device.id} className="rounded-3xl border border-black/10 bg-[var(--paper)]/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-black">{userEmailById.get(String(device.user_id)) ?? "-"}</p>
                  {device.revoked_at ? (
                    <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">
                      Kaldırıldı
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                      Aktif
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-black/62">
                  {device.device_label} · {device.browser ?? "Tarayıcı"} / {device.platform ?? "Platform"}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-black/50 sm:grid-cols-2">
                  <p>Onaylandı: {formatDateTime(device.approved_at)}</p>
                  <p>Son görülen: {formatDateTime(device.last_seen_at)}</p>
                  <p>IP: {device.last_ip ?? "-"}</p>
                  <p>Kaldırıldı: {formatDateTime(device.revoked_at)}</p>
                </div>
                {!device.revoked_at ? (
                  <div className="mt-4">
                    <form action={revokeTrustedDeviceByAdmin}>
                      <input type="hidden" name="device_id" value={device.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                      >
                        Cihazı kaldır
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
