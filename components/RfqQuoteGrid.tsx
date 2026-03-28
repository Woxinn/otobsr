"use client";

import { Fragment, useState } from "react";
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
  quantity?: number | null;
  domestic_cost_percent?: number | null;
  gtip?: any | null;
  weight_kg?: number | null;
  target_unit_price?: number | null;
};

export default function RfqQuoteGrid({
  rfqId,
  currency,
  items,
  suppliers,
}: {
  rfqId: string;
  currency?: string | null;
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
    } catch (error) {
      console.error("[rfq-quote-inline-save]", error);
      addToast("Kaydedilemedi", "error");
    } finally {
      setSaving(null);
      stopEdit();
    }
  };

  const getCurrentPrice = (sup: QuoteSupplier, item: QuoteItem) => {
    const qi = sup.quote_items?.find((q) => q.rfq_item_id === item.id);
    return qi?.unit_price ?? null;
  };

  const getNetCost = (sup: QuoteSupplier, item: QuoteItem) => {
    const current = getCurrentPrice(sup, item);
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
    return {
      netCost: costResult?.gozetimsizMatrah ?? costResult?.gozetimliMatrah ?? null,
      hasGtip: Boolean(gtip),
    };
  };

  const getComparableDiffPct = (sup: QuoteSupplier, item: QuoteItem) => {
    const current = getCurrentPrice(sup, item);
    const target = item.target_unit_price ?? null;
    if (current == null || target == null || target === 0) return null;
    if (currency && sup.currency && String(sup.currency) !== String(currency)) return null;
    return ((current - target) / target) * 100;
  };

  const renderPriceCell = (sup: QuoteSupplier, item: QuoteItem) => {
    const current = getCurrentPrice(sup, item);
    const key = `${sup.id}-${item.id}`;
    const isEditing = editingKey === key;
    const { netCost, hasGtip } = getNetCost(sup, item);

    if (isEditing) {
      return (
        <div className="rounded-xl border border-[var(--ocean)]/25 bg-white px-2.5 py-2 shadow-sm">
          <input
            autoFocus
            type="number"
            step="0.000001"
            className="w-full rounded-lg border border-black/15 px-2 py-1 text-right text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => save(sup.id, item.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save(sup.id, item.id);
              if (e.key === "Escape") stopEdit();
            }}
          />
        </div>
      );
    }

    return (
      <button
        type="button"
        onDoubleClick={() => startEdit(sup.id, item.id, current)}
        className={`w-full rounded-xl border px-2.5 py-2 text-right transition ${
          current != null
            ? "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300"
            : "border-black/10 bg-white text-black/45 hover:bg-black/[0.02]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-black/5 px-2 py-[3px] text-[9px] font-semibold uppercase tracking-[0.14em] text-black/45">
            {sup.currency ?? currency ?? "-"}
          </span>
          {saving === key ? <span className="text-[9px] text-black/35">...</span> : null}
        </div>
        <div className={`mt-2 text-base font-semibold leading-none ${current != null ? "text-black" : "text-black/35"}`}>
          {current != null ? current : "-"}
        </div>
        <div className="mt-2 border-t border-black/5 pt-2 text-left">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/35">KDV'siz maliyet</div>
          <div className={`mt-1 text-xs font-semibold ${netCost != null ? "text-black/75" : "text-black/35"}`}>
            {netCost != null ? netCost.toFixed(3) : "-"}
          </div>
          {netCost == null && !hasGtip ? <div className="mt-1 text-[9px] text-red-500">GTIP yok</div> : null}
        </div>
      </button>
    );
  };

  const renderDiffPctChip = (sup: QuoteSupplier, item: QuoteItem) => {
    const diffPct = getComparableDiffPct(sup, item);
    if (diffPct == null) {
      if (item.target_unit_price != null && currency && sup.currency && String(sup.currency) !== String(currency)) {
        return (
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            Kur farkli
          </span>
        );
      }
      return <span className="text-black/35">-</span>;
    }

    const favorable = diffPct <= 0;
    const sign = diffPct > 0 ? "+" : "";
    return (
      <span
        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
          favorable
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-600"
        }`}
      >
        {sign}{diffPct.toFixed(2)}%
      </span>
    );
  };

  const supList = suppliers;

  if (!supList.length) return <p className="text-sm text-black/60">Henüz teklif yok.</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[18rem]" />
          <col className="w-[7rem]" />
          <col className="w-[10rem]" />
          {supList.map((s) => (
            <Fragment key={`cols-${s.id}`}>
              <col className="w-[9rem]" />
              <col className="w-[7rem]" />
            </Fragment>
          ))}
        </colgroup>
        <thead className="bg-black/[0.02] text-[11px] uppercase tracking-[0.18em] text-black/45">
          <tr>
            <th rowSpan={2} className="border-r border-black/10 px-4 py-4 text-left">Ürün</th>
            <th rowSpan={2} className="border-r border-black/10 px-3 py-4 text-right">RFQ adet</th>
            <th rowSpan={2} className="border-r border-black/10 px-3 py-4 text-right">Hedef fiyat</th>
            {supList.map((s) => (
              <th key={s.id} colSpan={2} className="border-l border-black/10 px-3 py-3 text-center align-top">
                <div className="flex justify-center">
                  <span
                    className="inline-flex max-w-full items-center gap-2 rounded-full bg-[var(--ocean)]/10 px-3 py-1 text-[12px] font-semibold normal-case tracking-normal text-[var(--ocean)]"
                    title={s.name}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--ocean)]" />
                    <span className="max-w-[8rem] truncate">{s.name}</span>
                  </span>
                </div>
                <div className="mt-1 text-[11px] normal-case tracking-normal text-black/45">{s.currency ?? "-"}</div>
              </th>
            ))}
          </tr>
          <tr>
            {supList.map((s) => (
              <Fragment key={`head-${s.id}`}>
                <th className="border-l border-black/10 px-3 py-2 text-center">Teklif</th>
                <th className="border-l border-black/10 px-3 py-2 text-center">Hedef %</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={it.id} className={idx % 2 === 0 ? "bg-white" : "bg-black/[0.015]"}>
              <td className="border-t border-r border-black/10 px-4 py-4 align-top">
                <div className="font-semibold text-black">{it.product_code ?? "-"}</div>
                <div className="mt-1 text-xs text-black/60">{it.product_name ?? "-"}</div>
              </td>
              <td className="border-t border-r border-black/10 px-3 py-4 text-right align-top">
                <span className="inline-flex rounded-full bg-black/5 px-3 py-1 font-semibold text-black/70">
                  {it.quantity ?? "-"}
                </span>
              </td>
              <td className="border-t border-r border-black/10 px-3 py-4 text-right align-top">
                {it.target_unit_price != null ? (
                  <div className="inline-flex flex-col items-end rounded-xl border border-black/10 bg-white px-3 py-2 shadow-sm">
                    <span className="text-[9px] uppercase tracking-[0.14em] text-black/35">{currency ?? "-"}</span>
                    <span className="mt-1 text-sm font-semibold text-black">{it.target_unit_price}</span>
                  </div>
                ) : (
                  <span className="text-black/35">-</span>
                )}
              </td>
              {supList.map((s) => (
                <Fragment key={`${it.id}-${s.id}`}>
                  <td className="border-t border-l border-black/10 px-3 py-3 align-top">{renderPriceCell(s, it)}</td>
                  <td className="border-t border-l border-black/10 px-3 py-3 text-center align-top">{renderDiffPctChip(s, it)}</td>
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
