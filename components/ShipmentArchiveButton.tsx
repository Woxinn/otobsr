"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = {
  shipmentId: string;
  archived: boolean;
};

export function ShipmentArchiveButton({ shipmentId, archived }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const handleClick = () => {
    const msg = archived
      ? "Arsivden cikarilsin mi?"
      : "Shipment arsivlemek istiyor musunuz?";
    if (!confirm(msg)) return;

    start(async () => {
      await fetch("/api/shipments/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shipmentId, archived: !archived }),
      });
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={
        archived
          ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 hover:border-emerald-400 disabled:opacity-60"
          : "rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-60"
      }
    >
      {pending ? "Bekleyin..." : archived ? "Arsivden cikar" : "Arsivle"}
    </button>
  );
}
