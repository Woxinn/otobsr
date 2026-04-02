"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

const toastMessages: Record<string, string> = {
  "item-created": "Ürün eklendi.",
  "item-updated": "Ürün güncellendi.",
  "item-deleted": "Ürün silindi.",
  "items-deleted-all": "Tüm ürün kalemleri silindi.",
  "items-imported": "Ürünler import edildi.",
  "items-import-empty": "Import dosyası boş veya uygun satır yok.",
  "items-import-failed": "Import sırasında hata oluştu.",
  "pl-imported": "Packing list import edildi.",
  "pl-import-empty": "Packing list import dosyası boş veya uygun satır yok.",
  "pl-import-failed": "Packing list import sırasında hata oluştu.",
  "pl-created": "Packing list satırı eklendi.",
  "pl-create-empty": "Packing list için en az bir alan doldurun.",
  "pl-create-failed": "Packing list satırı eklenemedi.",
  "pl-deleted": "Packing list satırı silindi.",
  "pl-deleted-all": "Packing list temizlendi.",
  "payment-created": "Ödeme eklendi.",
  "payment-deleted": "Ödeme silindi.",
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

