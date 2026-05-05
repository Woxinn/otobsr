"use client";

import { useState } from "react";

export default function RfqItemQuantityField({
  rfqId,
  rfqItemId,
  value,
}: {
  rfqId: string;
  rfqItemId: string;
  value: number | null;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rfq/item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfq_id: rfqId,
          rfq_item_id: rfqItemId,
          quantity: draft === "" ? null : Number(draft),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Kaydedilemedi");
        return;
      }
      setDraft(data?.quantity != null ? String(data.quantity) : "");
    } catch (error) {
      console.error("[rfq-item-qty]", error);
      setMessage("Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="min-w-[6rem]">
        <input
          type="number"
          step="0.01"
          className="w-full rounded-lg border border-black/15 px-2 py-1 text-right text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        {message ? <div className="mt-1 text-[11px] text-red-600">{message}</div> : null}
      </div>
      {saving ? <span className="text-[11px] text-black/45">...</span> : null}
    </div>
  );
}

