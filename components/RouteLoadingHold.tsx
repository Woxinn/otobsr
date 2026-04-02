"use client";

import { useEffect } from "react";

export default function RouteLoadingHold({
  label = "Yükleniyor",
  detail = "Ekran verileri getiriliyor",
}: {
  label?: string;
  detail?: string;
}) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("route-loader:hold", {
        detail: { label, detail },
      })
    );

    return () => {
      window.dispatchEvent(new CustomEvent("route-loader:release"));
    };
  }, [label, detail]);

  return null;
}
