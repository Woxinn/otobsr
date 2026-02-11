"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

const toastMessages: Record<string, { message: string; tone: "error" | "info" }> = {
  "duplicate-code": {
    message: "Bu urun daha once eklenmis.",
    tone: "error",
  },
  "create-failed": {
    message: "Urun kaydedilemedi.",
    tone: "error",
  },
  imported: {
    message: "Urunler import edildi.",
    tone: "info",
  },
  "import-empty": {
    message: "Import dosyasi bos veya uygun satir yok.",
    tone: "error",
  },
  "import-failed": {
    message: "Import sirasinda hata olustu.",
    tone: "error",
  },
};

export default function ProductsToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    const toastKey = searchParams.get("toast");
    const added = searchParams.get("added");
    if (!toastKey) return;

    const config = toastMessages[toastKey];
    if (config) {
      const message =
        toastKey === "imported" && added
          ? `Urunler import edildi. (${added} adet)`
          : config.message;
      addToast(message, config.tone);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("toast");
    nextParams.delete("added");
    const query = nextParams.toString();
    router.replace(`/products/new${query ? `?${query}` : ""}`, { scroll: false });
  }, [addToast, router, searchParams]);

  return null;
}
