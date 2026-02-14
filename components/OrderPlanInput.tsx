"use client";

import { useState, useTransition } from "react";

type Props = {
  productId: string;
  defaultValue: number | null;
  need: number | null;
  suggest: number | null;
};

export default function OrderPlanInput({ productId, defaultValue, need, suggest }: Props) {
  const [value, setValue] = useState<string>(defaultValue?.toString() ?? "");
  const [pending, startTransition] = useTransition();

  const handleChange = (next: string) => {
    setValue(next);
    const numeric = Number(next);
    if (Number.isNaN(numeric)) return;
    startTransition(() => {
      void fetch("/api/order-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          value: numeric,
          need_qty: need,
          suggest_qty: suggest,
        }),
      });
    });
  };

  return (
    <input
      type="number"
      step="1"
      min="0"
      className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      aria-busy={pending}
    />
  );
}
