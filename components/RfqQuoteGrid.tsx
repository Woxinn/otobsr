"use client";

import { Fragment, useMemo, useState } from "react";
import { useToast } from "./ToastProvider";
import { calculateDisplayedNetCost, type CountryRateRow } from "@/lib/productCostDisplay";

type QuoteSupplier = {
  id: string;
  name: string;
  country?: string | null;
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
  country_rates?: CountryRateRow[] | null;
  weight_kg?: number | null;
  target_unit_price?: number | null;
};

type Baseline = {
  kind: "offer" | "target" | null;
  value: number | null;
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

  const formatNumber = (value: number | null | undefined, digits = 2) => {
    if (value == null || !Number.isFinite(value)) return "-";
    return value.toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
  };

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

  const isComparableCurrency = (sup: QuoteSupplier) =>
    !currency || !sup.currency || String(sup.currency) === String(currency);

  const getNetCost = (sup: QuoteSupplier, item: QuoteItem) => {
    const current = getCurrentPrice(sup, item);
    const gtip = Array.isArray((item as any).gtip) ? (item as any).gtip?.[0] ?? null : (item as any).gtip ?? null;
    const result =
      current != null
        ? calculateDisplayedNetCost({
            basePrice: current,
            domesticCostPercent: item.domestic_cost_percent ?? null,
            weightKg: item.weight_kg ?? null,
            gtipBase: gtip,
            countryRates: item.country_rates ?? [],
            selectedCountry: sup.country ?? null,
          })
        : null;
    return {
      netCost: result?.netCost ?? null,
      hasGtip: result?.hasGtip ?? Boolean(gtip),
    };
  };

  const getItemBaseline = (item: QuoteItem): Baseline => {
    const offerPrices = suppliers
      .filter((sup) => isComparableCurrency(sup))
      .map((sup) => getCurrentPrice(sup, item))
      .filter((price): price is number => typeof price === "number" && Number.isFinite(price));

    if (offerPrices.length >= 2) {
      return { kind: "offer", value: Math.min(...offerPrices) };
    }

    if (offerPrices.length === 1 && item.target_unit_price != null && Number(item.target_unit_price) !== 0) {
      return { kind: "target", value: Number(item.target_unit_price) };
    }

    return { kind: null, value: null };
  };

  const getTotalForSupplier = (sup: QuoteSupplier) => {
    if (!isComparableCurrency(sup)) return null;
    let total = 0;
    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      const price = getCurrentPrice(sup, item);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (price == null || !Number.isFinite(price)) return null;
      total += qty * price;
    }
    return total;
  };

  const targetTotal = useMemo(() => {
    let total = 0;
    let used = false;
    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      const target = Number(item.target_unit_price ?? NaN);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (!Number.isFinite(target)) return null;
      total += qty * target;
      used = true;
    }
    return used ? total : null;
  }, [items]);

  const totalBaseline = useMemo<Baseline>(() => {
    const totals = suppliers
      .map((sup) => getTotalForSupplier(sup))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    if (totals.length >= 2) {
      return { kind: "offer", value: Math.min(...totals) };
    }

    if (totals.length === 1 && targetTotal != null && targetTotal !== 0) {
      return { kind: "target", value: targetTotal };
    }

    return { kind: null, value: null };
  }, [items, suppliers, targetTotal]);

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
    const current = getCurrentPrice(sup, item);
    if (current == null) return <span className="text-black/35">-</span>;
    if (!isComparableCurrency(sup)) {
      return (
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          Kur farkli
        </span>
      );
    }

    const baseline = getItemBaseline(item);
    if (baseline.value == null || baseline.value === 0) return <span className="text-black/35">-</span>;

    const pct = ((current - baseline.value) / baseline.value) * 100;
    const favorable = pct <= 0;
    const sign = pct > 0 ? "+" : "";
    const title = baseline.kind === "offer" ? "En dusuk teklif bazli" : "Hedef fiyat bazli";

    return (
      <span
        title={title}
        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
          favorable
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-600"
        }`}
      >
        {sign}{pct.toFixed(2)}%
      </span>
    );
  };

  const renderTotalCell = (sup: QuoteSupplier) => {
    const total = getTotalForSupplier(sup);
    return total != null ? `${formatNumber(total, 2)} ${sup.currency ?? currency ?? ""}` : "-";
  };

  const renderTotalDiffPctChip = (sup: QuoteSupplier) => {
    const total = getTotalForSupplier(sup);
    if (total == null) return <span className="text-black/35">-</span>;
    if (!isComparableCurrency(sup)) {
      return (
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          Kur farkli
        </span>
      );
    }
    if (totalBaseline.value == null || totalBaseline.value === 0) return <span className="text-black/35">-</span>;

    const pct = ((total - totalBaseline.value) / totalBaseline.value) * 100;
    const favorable = pct <= 0;
    const sign = pct > 0 ? "+" : "";
    const title = totalBaseline.kind === "offer" ? "En dusuk toplam teklif bazli" : "Toplam hedef bazli";

    return (
      <span
        title={title}
        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
          favorable
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-600"
        }`}
      >
        {sign}{pct.toFixed(2)}%
      </span>
    );
  };

  const supList = suppliers;

  if (!supList.length) return <p className="text-sm text-black/60">Henüz teklif yok.</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
      <div className="border-b border-black/10 px-4 py-3 text-[11px] text-black/45">
        Fark %: birden fazla teklifte en dusuk teklif, tek teklifte hedef fiyat baz alinir.
      </div>
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
            <th rowSpan={2} className="sticky left-0 z-30 border-r border-black/10 bg-[inherit] px-4 py-4 text-left shadow-[6px_0_12px_-12px_rgba(0,0,0,0.35)]">
              Ürün
            </th>
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
                <th className="border-l border-black/10 px-3 py-2 text-center">Fark %</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const rowBgClass = idx % 2 === 0 ? "bg-white" : "bg-[#f6f7f8]";
            return (
            <tr key={it.id} className={rowBgClass}>
              <td className={`sticky left-0 z-20 border-t border-r border-black/10 px-4 py-4 align-top shadow-[6px_0_12px_-12px_rgba(0,0,0,0.35)] ${rowBgClass}`}>
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
          )})}
        </tbody>
        <tfoot className="bg-[#f1f3f4]">
          <tr>
            <td className="sticky left-0 z-20 border-t border-r border-black/10 bg-[#f1f3f4] px-4 py-4 font-semibold text-black shadow-[6px_0_12px_-12px_rgba(0,0,0,0.35)]">
              Toplam
            </td>
            <td className="border-t border-r border-black/10 px-3 py-4 text-right text-black/45">Adet x fiyat</td>
            <td className="border-t border-r border-black/10 px-3 py-4 text-right font-semibold text-black/75">
              {targetTotal != null ? `${formatNumber(targetTotal, 2)} ${currency ?? ""}` : "-"}
            </td>
            {supList.map((s) => (
              <Fragment key={`total-${s.id}`}>
                <td className="border-t border-l border-black/10 px-3 py-4 text-right font-semibold text-black/85">{renderTotalCell(s)}</td>
                <td className="border-t border-l border-black/10 px-3 py-4 text-center">{renderTotalDiffPctChip(s)}</td>
              </Fragment>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
