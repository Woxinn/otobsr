"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

type Props = {
  email: string;
  returnTo: string;
  initialMessage?: string | null;
};

type DeviceStatus = {
  status?: "pending" | "approved" | "expired" | "missing" | "already-approved";
  message?: string;
  error?: string;
  detail?: string;
  expiresAt?: string;
  secondsRemaining?: number;
  returnTo?: string;
};

const formatCountdown = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
};

export default function DeviceApprovalClient({ email, returnTo, initialMessage }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState(initialMessage ?? "Yönetici onayı bekleniyor...");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestActive, setRequestActive] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const autoRequestTriggeredRef = useRef(false);

  const requestApproval = async () => {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/device/send-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnTo }),
    });

    const payload = (await response.json().catch(() => ({}))) as DeviceStatus;
    setLoading(false);

    if (!response.ok) {
      setRequestActive(false);
      const nextError =
        process.env.NODE_ENV !== "production" && payload.detail
          ? `${payload.error ?? "Cihaz onay talebi oluşturulamadı."} (${payload.detail})`
          : payload.error ?? "Cihaz onay talebi oluşturulamadı.";
      setError(nextError);
      console.error("[device-check] request approval error", payload);
      return;
    }

    if (payload.status === "already-approved") {
      router.push(returnTo);
      router.refresh();
      return;
    }

    setRequestActive(true);
    setMessage(payload.message ?? "Yönetici onayı bekleniyor.");
    setExpiresAt(payload.expiresAt ?? null);
    setSecondsRemaining(payload.secondsRemaining ?? 0);
  };

  const finalizeDevice = async (nextRoute: string) => {
    if (finalizing) return;
    setFinalizing(true);
    const response = await fetch("/api/auth/device/finalize", { method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as DeviceStatus;
    setFinalizing(false);

    if (!response.ok) {
      setError(payload.error ?? "Cihaz doğrulaması tamamlanamadı.");
      return;
    }

    router.push(payload.returnTo ?? nextRoute);
    router.refresh();
  };

  useEffect(() => {
    if (!autoRequestTriggeredRef.current && !requestActive && !loading && !finalizing) {
      autoRequestTriggeredRef.current = true;
      void requestApproval();
    }
  }, [requestActive, loading, finalizing]);

  useEffect(() => {
    if (!requestActive) return;
    const interval = window.setInterval(async () => {
      const response = await fetch("/api/auth/device/status", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as DeviceStatus;

      if (!response.ok) {
        const nextError =
          process.env.NODE_ENV !== "production" && payload.detail
            ? `${payload.error ?? "Cihaz durumu okunamadı."} (${payload.detail})`
            : payload.error ?? "Cihaz durumu okunamadı.";
        setError(nextError);
        console.error("[device-check] status polling error", payload);
        return;
      }

      if (payload.status === "approved") {
        setMessage("Yönetici onayı geldi. Giriş tamamlanıyor...");
        await finalizeDevice(payload.returnTo ?? returnTo);
        return;
      }

      if (payload.status === "expired") {
        setRequestActive(false);
        setSecondsRemaining(0);
        setExpiresAt(payload.expiresAt ?? null);
        setMessage("Onay talebinin süresi doldu. Yeni onay isteyebilirsiniz.");
        return;
      }

      if (payload.status === "missing") {
        setRequestActive(false);
        setSecondsRemaining(0);
        setExpiresAt(null);
        setMessage("Bekleyen cihaz talebi bulunamadı. Yeni onay isteyin.");
        return;
      }

      setSecondsRemaining(payload.secondsRemaining ?? 0);
      if (payload.expiresAt) {
        setExpiresAt(payload.expiresAt);
      }
      if (payload.message) {
        setMessage(payload.message);
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [requestActive, returnTo]);

  useEffect(() => {
    if (!expiresAt) return;
    const interval = window.setInterval(() => {
      const diff = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsRemaining(diff);
      if (diff <= 0) {
        setRequestActive(false);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [expiresAt]);

  const canRequestAgain = useMemo(() => !requestActive && !loading && !finalizing, [requestActive, loading, finalizing]);

  return (
    <div className="rounded-[28px] border border-black/10 bg-white/90 p-6 shadow-sm">
      {finalizing ? (
        <div className="mb-5 rounded-[24px] border border-emerald-200 bg-[linear-gradient(135deg,rgba(19,60,69,0.08)_0%,rgba(31,113,102,0.14)_100%)] px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#1f7166]">Giriş hazırlanıyor</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#1f7166]/20 border-t-[#1f7166]" />
            <div>
              <p className="text-sm font-semibold text-black">Onay alındı, yönlendiriliyorsunuz.</p>
              <p className="mt-1 text-xs text-black/55">Güvenilir cihaz kaydı tamamlanıyor ve oturum açılıyor.</p>
            </div>
          </div>
        </div>
      ) : null}
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/40">Cihaz doğrulama</p>
      <h2 className="mt-3 text-2xl font-semibold text-black">Bu cihaz henüz onaylı değil</h2>
      <p className="mt-3 text-sm leading-6 text-black/65">
        <span className="font-semibold text-black">{email}</span> hesabı için yönetici onayı gerekiyor. Onay verildiğinde bu
        ekran otomatik olarak devam edecek.
      </p>

      <div className="mt-5 rounded-2xl border border-black/10 bg-[var(--paper)]/75 p-4 text-sm text-black/70">
        {error ? <p className="font-medium text-rose-700">{error}</p> : <p>{message}</p>}
        {requestActive ? (
          <div className="mt-4 rounded-2xl border border-black/10 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.24em] text-black/40">Kalan süre</p>
            <p className="mt-2 text-2xl font-semibold text-black">{formatCountdown(secondsRemaining)}</p>
            <p className="mt-2 text-xs text-black/50">2 dakika içinde yönetici onayı gelmezse yeni talep oluşturmanız gerekir.</p>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {canRequestAgain ? (
          <button
            type="button"
            onClick={() => void requestApproval()}
            className="rounded-full bg-[linear-gradient(135deg,#133c45_0%,#1f7166_100%)] px-5 py-3 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "İstek oluşturuluyor..." : "Yeni onay iste"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-full bg-[linear-gradient(135deg,#133c45_0%,#1f7166_100%)] px-5 py-3 text-sm font-semibold text-white opacity-70"
          >
            {finalizing ? "Giriş tamamlanıyor..." : "Yönetici onayı bekleniyor"}
          </button>
        )}
        <SignOutButton />
      </div>
    </div>
  );
}
