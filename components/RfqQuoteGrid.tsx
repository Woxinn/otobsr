"use client";

import { useState } from "react";
import { useToast } from "./ToastProvider";
import { computeCosts } from "@/lib/gtipCost";

type QuoteSupplier = {
  id: string;
  name: string;
  currency?: string | null;
  transit?: string | number | null;
  quote_items?: { rfq_item_id: string; unit_price: number | null }[];
};

type QuoteItem = {
  id: string;
  product_code?: string | null;
  product_name?: string | null;
  domestic_cost_percent?: number | null;
  gtip?: any | null;
  weight_kg?: number | null;
};

export default function RfqQuoteGrid({
  rfqId,
  items,
  suppliers,
}: {
  rfqId: string;
  items: QuoteItem[];
  suppliers: QuoteSupplier[];
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState<string | null>(null);
  const { addToast } = useToast();

  const startEdit = (supplierId: string, itemId: string, current?: number | null) => {
    const key = `${supplierId}-${itemId}`;
    setEditingKey(key);
    setValue(current != null ? String(current) : "");
  };

  const stopEdit = () => {
    setEditingKey(null);
    setValue("");
  };

  const save = async (supplierId: string, itemId: string) => {
    const key = `${supplierId}-${itemId}`;
    if (saving === key) return;
    setSaving(key);
    try {
      await fetch("/api/rfq/quote-item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfq_id: rfqId,
          supplier_id: supplierId,
          rfq_item_id: itemId,
          unit_price: value === "" ? null : Number(value),
        }),
      });
      // sayfayı yenilemek yerine optimistic değeri güncelle
      const supIdx = suppliers.findIndex((s) => s.id === supplierId);
      if (supIdx >= 0) {
        const sup = suppliers[supIdx];
        const itemsArr = sup.quote_items ?? [];
        const qi = itemsArr.find((q) => q.rfq_item_id === itemId);
        if (qi) qi.unit_price = value === "" ? null : Number(value);
        else itemsArr.push({ rfq_item_id: itemId, unit_price: value === "" ? null : Number(value) });
        sup.quote_items = [...itemsArr];
      }
      addToast("Kaydedildi", "success");
    } catch (e) {
      console.error("[rfq-quote-inline-save]", e);
      addToast("Kaydedilemedi", "error");
    } finally {
      setSaving(null);
      stopEdit();
    }
  };

  const renderCell = (sup: QuoteSupplier, item: QuoteItem) => {
    const qi = sup.quote_items?.find((q) => q.rfq_item_id === item.id);
    const current = qi?.unit_price ?? null;
    const key = `${sup.id}-${item.id}`;
    const isEditing = editingKey === key;
    const gtip = Array.isArray((item as any).gtip) ? (item as any).gtip?.[0] ?? null : (item as any).gtip ?? null;
    const costResult =
      current != null
        ? computeCosts({
            basePrice: current,
            domesticCostPercent: item.domestic_cost_percent ?? null,
            weightKg: item.weight_kg ?? null,
            gtip,
          })
        : null;
    const kdvsiz = costResult?.gozetimsizMatrah ?? costResult?.gozetimliMatrah ?? null;

    if (isEditing) {
      return (
        <input
          autoFocus
          type="number"
          step="0.0001"
          className="w-24 rounded-lg border border-black/15 px-2 py-1 text-right text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save(sup.id, item.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(sup.id, item.id);
            if (e.key === "Escape") stopEdit();
          }}
        />
      );
    }

    return (
      <div className="space-y-1">
        <button
          type="button"
          className={`w-full rounded-lg px-2 py-1 text-right text-sm transition ${
            current != null
              ? "bg-[var(--mint)]/40 text-black hover:bg-[var(--mint)]/60"
              : "text-black/50 hover:bg-black/5"
          }`}
          onDoubleClick={() => startEdit(sup.id, item.id, current)}
        >
          {current != null ? current : "-"} {sup.currency ?? ""}
        </button>
        <div className="text-[11px] text-black/60 text-right">
          {kdvsiz != null ? (
            <span>
              KDV'siz maliyet: <strong>{kdvsiz.toFixed(3)}</strong>
            </span>
          ) : (
            <span>
              KDV'siz maliyet: -{" "}
              {!gtip ? <span className="text-red-500 font-semibold">(GTIP yok)</span> : null}
            </span>
          )}
        </div>
      </div>
    );
  };

  const supList = suppliers;

  if (!supList.length) return <p className="text-sm text-black/60">Henüz teklif yok.</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10">
      <table className="w-full text-sm">
        <thead className="bg-black/5 text-left text-[11px] uppercase tracking-[0.22em] text-black/50">
          <tr>
            <th className="border-r border-black/10 px-4 py-3">Ürün</th>
            {supList.map((s) => (
              <th key={s.id} className="border-l border-black/10 px-4 py-3 text-right">
                <div className="flex justify-end">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[var(--ocean)]/10 px-3 py-1 text-[12px] font-semibold text-[var(--ocean)]">
                    <span className="h-2 w-2 rounded-full bg-[var(--ocean)]" />
                    {s.name}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-black/50">
                  <span className="rounded-full bg-black/5 px-2 py-[2px]">{s.currency ?? "-"}</span>
                  <span className="rounded-full bg-black/5 px-2 py-[2px]">
                    {s.transit ? `${s.transit} gün` : "-"}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={it.id} className={`border-t border-black/10 ${idx % 2 === 0 ? "bg-white" : "bg-black/2.5"}`}>
              <td className="border-r border-black/10 px-4 py-3">
                <div className="font-semibold text-black">{it.product_code ?? "-"}</div>
                <div className="text-xs text-black/60">{it.product_name ?? "-"}</div>
              </td>
              {supList.map((s) => (
                <td key={s.id} className="border-l border-black/10 px-4 py-3 text-right">
                  {renderCell(s, it)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
