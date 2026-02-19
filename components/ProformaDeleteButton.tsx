"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";

type Props = {
  proformaId: string;
  redirectTo?: string;
  compact?: boolean;
};

export default function ProformaDeleteButton({ proformaId, redirectTo, compact = false }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { addToast } = useToast();

  const handleDelete = async () => {
    const ok = window.confirm("Proforma silinsin mi? Bu islem geri alinamaz.");
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch("/api/proformas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proforma_id: proformaId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        addToast(data?.error ?? "Proforma silinemedi", "error");
        return;
      }
      addToast("Proforma silindi", "success");
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error("[proforma-delete]", err);
      addToast("Sunucu hatasi", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className={
        compact
          ? "rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
          : "rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
      }
    >
      {loading ? "Siliniyor..." : "Sil"}
    </button>
  );
}

