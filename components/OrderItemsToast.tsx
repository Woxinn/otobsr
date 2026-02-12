"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

const toastMessages: Record<string, string> = {
  "item-created": "Ürün eklendi.",
  "item-updated": "Ürün guncellendi.",
  "item-deleted": "Ürün silindi.",
  "items-deleted-all": "Tum urun kalemleri silindi.",
  "items-imported": "Ürünler import edildi.",
  "items-import-empty": "Import dosyasi bos veya uygun satir yok.",
  "items-import-failed": "Import sirasinda hata olustu.",
  "pl-imported": "Packing list import edildi.",
  "pl-import-empty": "Packing list import dosyasi bos veya uygun satir yok.",
  "pl-import-failed": "Packing list import sirasinda hata olustu.",
  "pl-created": "Packing list satiri eklendi.",
  "pl-create-empty": "Packing list icin en az bir alan doldurun.",
  "pl-create-failed": "Packing list satiri eklenemedi.",
  "pl-deleted": "Packing list satiri silindi.",
  "pl-deleted-all": "Packing list temizlendi.",
  "payment-created": "Odeme eklendi.",
  "payment-deleted": "Odeme silindi.",
  "document-deleted": "Belge silindi.",
};

export default function OrderItemsToast({ orderId }: { orderId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    const toastKey = searchParams.get("toast");
    if (!toastKey) return;

    const message = toastMessages[toastKey];
    if (message) {
      addToast(message, "success");
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("toast");
    const query = nextParams.toString();
    router.replace(`/orders/${orderId}${query ? `?${query}` : ""}`, {
      scroll: false,
    });
  }, [addToast, orderId, router, searchParams]);

  return null;
}

