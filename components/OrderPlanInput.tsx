"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type Props = {
  productId: string;
  defaultValue: number | null;
  need: number | null;
  suggest: number | null;
  onLocalValueChange?: (value: number | null) => void;
};

export default function OrderPlanInput({
  productId,
  defaultValue,
  need,
  suggest,
  onLocalValueChange,
}: Props) {
  const [value, setValue] = useState<string>(defaultValue?.toString() ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string>(defaultValue?.toString() ?? "");

  const scheduleSave = (next: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!next.trim()) {
      setSaveState("idle");
      return;
    }
    const numeric = Number(next);
    if (Number.isNaN(numeric)) return;
    const payloadValue = String(numeric);
    if (payloadValue === lastSentRef.current) return;
    setSaveState("saving");
    debounceRef.current = setTimeout(() => {
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
        })
          .then((res) => {
            if (!res.ok) throw new Error("save failed");
            lastSentRef.current = payloadValue;
            setSaveState("saved");
          })
          .catch(() => setSaveState("error"));
      });
    }, 450);
  };

  const handleChange = (next: string) => {
    setValue(next);
    const numeric = next.trim() ? Number(next) : null;
    onLocalValueChange?.(numeric === null || Number.isNaN(numeric) ? null : numeric);
    scheduleSave(next);
  };

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  return (
    <div className="mt-1">
      <input
        type="number"
        step="1"
        min="0"
        className="h-8 w-full rounded-lg border border-black/15 px-2.5 text-xs"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        aria-busy={pending}
      />
      {saveState !== "idle" ? (
        <div className="mt-0.5 text-[10px] leading-tight">
          {saveState === "saving" ? <span className="text-black/45">Kaydediliyor...</span> : null}
          {saveState === "saved" ? <span className="text-emerald-700">Kaydedildi</span> : null}
          {saveState === "error" ? <span className="text-red-600">Kayit hatasi</span> : null}
        </div>
      ) : null}
    </div>
  );
}
