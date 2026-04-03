import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DeviceApprovalClient from "@/components/DeviceApprovalClient";
import Logo from "@/components/Logo";
import { hashDeviceToken, normalizeReturnTo, TRUSTED_DEVICE_COOKIE } from "@/lib/trusted-device";

type SearchParams = Promise<{
  returnTo?: string;
  status?: string;
}>;

export default async function DeviceCheckPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returnTo = normalizeReturnTo(params.returnTo);
  const status = params.status ?? null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const trustedToken = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value ?? null;

  if (trustedToken) {
    const tokenHash = await hashDeviceToken(trustedToken);
    const { data: trustedDevice } = await supabase
      .from("trusted_devices")
      .select("id")
      .eq("user_id", user.id)
      .eq("device_token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (trustedDevice) {
      redirect(returnTo);
    }
  }

  const statusMessage =
    status === "missing-pending"
      ? "Bu cihaz için yeni bir onay talebi oluşturmanız gerekiyor."
      : status === "invalid-link"
        ? "Eski onay bağlantıları artık kullanılmıyor. Yönetici onayı bekleyin."
        : status === "approved"
          ? "Yönetici onayı verildi. Giriş tamamlanıyor..."
          : null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(18,93,95,0.16),_transparent_34%),linear-gradient(135deg,#f2ede3_0%,#ebe4d6_45%,#d8d9d2_100%)] px-4 py-8 text-[var(--ink)] sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-center rounded-[30px] border border-black/10 bg-white/85 px-6 py-6 shadow-sm">
          <Logo className="h-20 w-auto object-contain" alt="Oto Başar" />
        </div>
        <DeviceApprovalClient email={user.email ?? "hesabınız"} returnTo={returnTo} initialMessage={statusMessage} />
      </div>
    </div>
  );
}
