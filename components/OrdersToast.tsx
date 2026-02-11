"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

const toastMessages: Record<string, string> = {
  created: "Siparis olusturuldu.",
  updated: "Siparis guncellendi.",
  deleted: "Siparis silindi.",
};

export default function OrdersToast() {
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
    router.replace(`/orders${query ? `?${query}` : ""}`, { scroll: false });
  }, [addToast, router, searchParams]);

  return null;
}
