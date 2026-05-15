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

type SupplierTotalInfo = {
  total: number | null;
  pricedCount: number;
  missingCount: number;
  relevantCount: number;
  complete: boolean;
};

export default function RfqQuoteGrid({
  rfqId,
  currency,
  items,
  suppliers,
  readOnly = false,
}: {
  rfqId: string;
  currency?: string | null;
  items: QuoteItem[];
  suppliers: QuoteSupplier[];
  readOnly?: boolean;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState<string | null>(null);
  const [costOverrides, setCostOverrides] = useState<Record<string, string>>({});
  const [marginOverrides, setMarginOverrides] = useState<Record<string, string>>({});
  const { addToast } = useToast();

  const formatNumber = (value: number | null | undefined, digits = 2) => {
    if (value == null || !Number.isFinite(value)) return "-";
    return value.toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
  };

  const startEdit = (supplierId: string, itemId: string, current?: number | null) => {
    if (readOnly) return;
    const key = `${supplierId}-${itemId}`;
    setEditingKey(key);
    setValue(current != null ? String(current) : "");
  };

  const stopEdit = () => {
    setEditingKey(null);
    setValue("");
  };

  const save = async (supplierId: string, itemId: string) => {
    if (readOnly) return;
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

  const isValidQuotePrice = (price: number | null | undefined): price is number =>
    typeof price === "number" && Number.isFinite(price) && price > 0;

  const parsePercentInput = (raw: string): number | null => {
    const normalized = raw.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getEffectiveDomesticCostPercent = (item: QuoteItem) => {
    const override = costOverrides[item.id];
    const parsed = override != null ? parsePercentInput(override) : null;
    return parsed ?? item.domestic_cost_percent ?? null;
  };

  const getEffectiveMarginPercent = (item: QuoteItem) => {
    const override = marginOverrides[item.id];
    const parsed = override != null ? parsePercentInput(override) : null;
    return parsed ?? 0;
  };

  const isComparableCurrency = (sup: QuoteSupplier) =>
    !currency || !sup.currency || String(sup.currency) === String(currency);

  const getNetCost = (sup: QuoteSupplier, item: QuoteItem) => {
    const current = getCurrentPrice(sup, item);
    const gtip = Array.isArray((item as any).gtip) ? (item as any).gtip?.[0] ?? null : (item as any).gtip ?? null;
    const result =
      isValidQuotePrice(current)
        ? calculateDisplayedNetCost({
            basePrice: current,
            domesticCostPercent: getEffectiveDomesticCostPercent(item),
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
      .filter((price): price is number => isValidQuotePrice(price));

    if (offerPrices.length >= 2) {
      return { kind: "offer", value: Math.min(...offerPrices) };
    }

    if (offerPrices.length === 1 && item.target_unit_price != null && Number(item.target_unit_price) !== 0) {
      return { kind: "target", value: Number(item.target_unit_price) };
    }

    return { kind: null, value: null };
  };

  const getTotalInfoForSupplier = (sup: QuoteSupplier): SupplierTotalInfo => {
    if (!isComparableCurrency(sup)) {
      return { total: null, pricedCount: 0, missingCount: 0, relevantCount: 0, complete: false };
    }
    let total = 0;
    let pricedCount = 0;
    let missingCount = 0;
    let relevantCount = 0;
    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      const price = getCurrentPrice(sup, item);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      relevantCount += 1;
      if (!isValidQuotePrice(price)) {
        missingCount += 1;
        continue;
      }
      pricedCount += 1;
      total += qty * price;
    }
    return {
      total: pricedCount ? total : null,
      pricedCount,
      missingCount,
      relevantCount,
      complete: relevantCount > 0 && missingCount === 0,
    };
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

  const totalQuantity = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = Number(item.quantity ?? 0);
      if (!Number.isFinite(qty)) return sum;
      return sum + qty;
    }, 0);
  }, [items]);

  const totalBaseline = useMemo<Baseline>(() => {
    const totals = suppliers
      .map((sup) => getTotalInfoForSupplier(sup))
      .filter((info) => info.complete)
      .map((info) => info.total)
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
    const hasValidPrice = isValidQuotePrice(current);
    const { netCost, hasGtip } = getNetCost(sup, item);
    const marginPct = getEffectiveMarginPercent(item);
    const sellingPrice = netCost != null ? netCost * (1 + marginPct / 100) : null;

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
        onDoubleClick={() => {
          if (!readOnly) startEdit(sup.id, item.id, current);
        }}
        className={`w-full rounded-lg border px-2 py-1.5 text-right transition ${
          hasValidPrice
            ? "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300"
            : current === 0
              ? "border-amber-200 bg-amber-50/70 text-amber-800 hover:border-amber-300"
              : "border-black/10 bg-white text-black/45 hover:bg-black/[0.02]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-black/5 px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.12em] text-black/45">
            {sup.currency ?? currency ?? "-"}
          </span>
          {saving === key ? <span className="text-[9px] text-black/35">...</span> : null}
        </div>
        <div className={`mt-1 text-sm font-semibold leading-none ${hasValidPrice ? "text-black" : current === 0 ? "text-amber-800" : "text-black/35"}`}>
          {current != null ? current : "-"}
        </div>
        {current === 0 ? (
          <div className="mt-1 text-[9px] font-semibold text-amber-700">0 eksik</div>
        ) : null}
        <div className="mt-1 border-t border-black/5 pt-1 text-left text-[10px] font-semibold text-black/45">
          <span className={netCost != null ? "text-black/70" : "text-black/30"}>M {netCost != null ? netCost.toFixed(3) : "-"}</span>
          <span className="mx-1 text-black/25">·</span>
          <span className={sellingPrice != null ? "text-[var(--ocean)]" : "text-black/30"}>
            S {sellingPrice != null ? sellingPrice.toFixed(3) : "-"}
          </span>
          {netCost == null && !hasGtip ? <div className="mt-1 text-[9px] text-red-500">GTIP yok</div> : null}
        </div>
      </button>
    );
  };

  const renderDiffPctChip = (sup: QuoteSupplier, item: QuoteItem) => {
    const current = getCurrentPrice(sup, item);
    if (!isValidQuotePrice(current)) {
      return current === 0 ? (
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          0 fiyat
        </span>
      ) : (
        <span className="text-black/35">-</span>
      );
    }
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
    const info = getTotalInfoForSupplier(sup);
    if (info.total == null) return "-";
    return (
      <div className="inline-flex flex-col items-end gap-1">
        <span>
          {formatNumber(info.total, 2)} {sup.currency ?? currency ?? ""}
        </span>
        {info.missingCount ? (
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Kısmi toplam
            </span>
            <span className="text-[10px] font-semibold text-amber-700">
              {info.missingCount} ürünün fiyatı eksik
            </span>
          </div>
        ) : null}
      </div>
    );
  };

  const renderTotalDiffPctChip = (sup: QuoteSupplier) => {
    const info = getTotalInfoForSupplier(sup);
    const total = info.total;
    if (total == null) return <span className="text-black/35">-</span>;
    if (!isComparableCurrency(sup)) {
      return (
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          Kur farkli
        </span>
      );
    }
    if (!info.complete) {
      return (
        <span
          title={`${info.missingCount} ürünün fiyatı eksik olduğu için toplam fark hesaplanmadı`}
          className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
        >
          {info.missingCount} ürün eksik
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
  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ rfq_id: rfqId });
    const overrides = Object.fromEntries(
      Object.entries(costOverrides)
        .map(([itemId, raw]) => [itemId, parsePercentInput(raw)])
        .filter(([, parsed]) => parsed != null)
    );
    if (Object.keys(overrides).length) {
      params.set("cost_overrides", JSON.stringify(overrides));
    }
    return `/api/rfq/export?${params.toString()}`;
  }, [costOverrides, rfqId]);

  if (!supList.length) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 bg-slate-50 px-4 py-6 text-center text-sm text-black/55">
        Henüz teklif yok.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-slate-50 px-4 py-2.5 text-[11px] font-medium text-black/50">
        <span>
          Fark %: birden fazla teklifte en dusuk teklif, tek teklifte hedef fiyat baz alinir. Sifir fiyatlar eksik sayilir.
          {readOnly ? " (Yonetim rolunde duzenleme kapali)" : ""}
        </span>
        <a
          href={exportHref}
          className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-black/70 transition hover:-translate-y-0.5 hover:bg-slate-50"
        >
          Excel (girilen masrafla)
        </a>
      </div>
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[14rem]" />
          <col className="w-[5.5rem]" />
          <col className="w-[7.5rem]" />
          {supList.map((s) => (
            <Fragment key={`cols-${s.id}`}>
              <col className="w-[7.5rem]" />
              <col className="w-[5.5rem]" />
            </Fragment>
          ))}
        </colgroup>
        <thead className="bg-[#f6f7f8] text-[11px] uppercase tracking-[0.16em] text-black/45">
          <tr>
            <th rowSpan={2} className="sticky left-0 z-30 border-r border-black/10 bg-[inherit] px-3 py-3 text-left shadow-[6px_0_12px_-12px_rgba(0,0,0,0.35)]">
              Ürün
            </th>
            <th rowSpan={2} className="border-r border-black/10 px-2 py-3 text-right">Adet</th>
            <th rowSpan={2} className="border-r border-black/10 px-2 py-3 text-right">Hedef</th>
            {supList.map((s) => {
              const totalInfo = getTotalInfoForSupplier(s);
              return (
                <th key={s.id} colSpan={2} className="border-l border-black/10 px-2 py-2 text-center align-top">
                  <div className="flex justify-center">
                    <span
                      className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold normal-case tracking-normal text-white"
                      title={s.name}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-300" />
                      <span className="max-w-[7rem] truncate">{s.name}</span>
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] normal-case tracking-normal text-black/45">{s.currency ?? "-"}</div>
                  {totalInfo.missingCount ? (
                    <div className="mt-1 flex justify-center">
                      <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-700">
                        {totalInfo.missingCount} ürün eksik
                      </span>
                    </div>
                  ) : null}
                </th>
              );
            })}
          </tr>
          <tr>
            {supList.map((s) => (
              <Fragment key={`head-${s.id}`}>
                <th className="border-l border-black/10 px-2 py-1.5 text-center">Teklif</th>
                <th className="border-l border-black/10 px-2 py-1.5 text-center">Fark</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const rowBgClass = idx % 2 === 0 ? "bg-white" : "bg-slate-50/70";
            return (
            <tr key={it.id} className={`${rowBgClass} transition hover:bg-emerald-50/30`}>
              <td className={`sticky left-0 z-20 border-t border-r border-black/10 px-3 py-2.5 align-top shadow-[6px_0_12px_-12px_rgba(0,0,0,0.35)] ${rowBgClass}`}>
                <div className="min-w-0">
                  <div className="font-semibold text-black">{it.product_code ?? "-"}</div>
                  <div className="mt-1 text-xs text-black/60">{it.product_name ?? "-"}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <label className="text-right">
                      <span className="text-[8px] uppercase tracking-[0.12em] text-black/35">Masraf</span>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={costOverrides[it.id] ?? String(it.domestic_cost_percent ?? "")}
                        onChange={(e) =>
                          setCostOverrides((prev) => ({
                            ...prev,
                            [it.id]: e.target.value,
                          }))
                        }
                        className="mt-0.5 w-14 rounded-md border border-black/10 bg-white px-1.5 py-0.5 text-right text-[11px] font-semibold text-black/75 outline-none transition focus:border-[var(--ocean)]/40 focus:ring-2 focus:ring-[var(--ocean)]/10"
                      />
                    </label>
                    <label className="text-right">
                      <span className="text-[8px] uppercase tracking-[0.12em] text-black/35">Kar</span>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={marginOverrides[it.id] ?? "0"}
                        onChange={(e) =>
                          setMarginOverrides((prev) => ({
                            ...prev,
                            [it.id]: e.target.value,
                          }))
                        }
                        className="mt-0.5 w-14 rounded-md border border-black/10 bg-white px-1.5 py-0.5 text-right text-[11px] font-semibold text-black/75 outline-none transition focus:border-[var(--ocean)]/40 focus:ring-2 focus:ring-[var(--ocean)]/10"
                      />
                    </label>
                  </div>
                </div>
              </td>
              <td className="border-t border-r border-black/10 px-2 py-2.5 text-right align-top">
                <span className="inline-flex rounded-md bg-black/5 px-2 py-1 font-semibold text-black/70">
                  {it.quantity ?? "-"}
                </span>
              </td>
              <td className="border-t border-r border-black/10 px-2 py-2.5 text-right align-top">
                {it.target_unit_price != null ? (
                  <div className="inline-flex flex-col items-end rounded-lg border border-black/10 bg-white px-2 py-1 shadow-sm">
                    <span className="text-[9px] uppercase tracking-[0.14em] text-black/35">{currency ?? "-"}</span>
                    <span className="mt-1 text-sm font-semibold text-black">{it.target_unit_price}</span>
                  </div>
                ) : (
                  <span className="text-black/35">-</span>
                )}
              </td>
              {supList.map((s) => (
                <Fragment key={`${it.id}-${s.id}`}>
                  <td className="border-t border-l border-black/10 px-2 py-2 align-top">{renderPriceCell(s, it)}</td>
                  <td className="border-t border-l border-black/10 px-2 py-2 text-center align-top">{renderDiffPctChip(s, it)}</td>
                </Fragment>
              ))}
            </tr>
          )})}
        </tbody>
        <tfoot className="bg-[#eef2f1]">
          <tr>
            <td className="sticky left-0 z-20 border-t border-r border-black/10 bg-[#eef2f1] px-4 py-4 font-semibold text-black shadow-[6px_0_12px_-12px_rgba(0,0,0,0.35)]">
              Toplam
            </td>
            <td className="border-t border-r border-black/10 px-3 py-4 text-right font-semibold text-black/75">
              {formatNumber(totalQuantity, 2)}
            </td>
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
