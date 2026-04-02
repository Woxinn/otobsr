"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

export default function ProductsListToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    const toastKey = searchParams.get("toast");
    if (!toastKey) return;

    if (toastKey === "netsis-import-ok") {
      const updated = searchParams.get("updated");
      const missing = searchParams.get("missing");
      addToast(
        `Stok kodu import: ${updated ?? "-"} güncellendi, ${missing ?? "0"} bulunamadı.`,
        "info"
      );
    } else if (toastKey === "products-import-ok") {
      const updated = searchParams.get("updated");
      const missing = searchParams.get("missing");
      addToast(
        `Ürün import: ${updated ?? "-"} güncellendi, ${missing ?? "0"} bulunamadı.`,
        "info"
      );
    } else if (toastKey === "delete-blocked") {
      addToast("Ürün silinemedi. Siparişte kullanılıyor.", "error");
    } else if (toastKey === "delete-blocked-all") {
      addToast("Tüm ürünler silinemedi. Siparişte kullanılan ürünler var.", "error");
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("toast");
    const query = nextParams.toString();
    router.replace(`/products${query ? `?${query}` : ""}`, { scroll: false });
  }, [addToast, router, searchParams]);

  return null;
}

