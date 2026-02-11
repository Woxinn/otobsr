"use client";

import { useState } from "react";
import Link from "next/link";
import { computeCosts, GtipRow } from "@/lib/gtipCost";

type CountryRate = {
  country: string;
  customs_duty_rate?: number | null;
  additional_duty_rate?: number | null;
  anti_dumping_applicable?: boolean | null;
  anti_dumping_rate?: number | null;
  surveillance_applicable?: boolean | null;
  surveillance_unit_value?: number | null;
  vat_rate?: number | null;
};

type Props = {
  product: {
    id: string;
    name: string | null;
    code: string | null;
    gtip_id: string | null;
    domestic_cost_percent: number | null;
  };
  gtipBase: GtipRow | null;
  countryRates: CountryRate[];
  availableCountries: string[];
  initialCountry: string | null;
  initialBasePrice: number | null;
  initialWeightKg: number | null;
};

const fmt = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString("tr-TR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
};

const parseInputNumber = (value: string) => {
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

export default function ProductCostCalculatorClient({
  product,
  gtipBase,
  countryRates,
  availableCountries,
  initialCountry,
  initialBasePrice,
  initialWeightKg,
}: Props) {
  const defaultCountry = initialCountry ?? availableCountries[0] ?? "";
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);
  const [basePriceText, setBasePriceText] = useState(
    initialBasePrice !== null ? String(initialBasePrice) : ""
  );
  const [weightText, setWeightText] = useState(
    initialWeightKg !== null ? String(initialWeightKg) : ""
  );
  const [domesticCostText, setDomesticCostText] = useState(
    product.domestic_cost_percent !== null && product.domestic_cost_percent !== undefined
      ? String(product.domestic_cost_percent)
      : ""
  );

  const basePrice = parseInputNumber(basePriceText);
  const weightKg = parseInputNumber(weightText);
  const domesticCostPercent = parseInputNumber(domesticCostText);

  const countryGtip = countryRates.find((c) => c.country === selectedCountry) ?? null;
  const gtipToUse: GtipRow | null = countryGtip
    ? {
        ...(gtipBase as any),
        customs_duty_rate: countryGtip.customs_duty_rate,
        additional_duty_rate: countryGtip.additional_duty_rate,
        anti_dumping_applicable: countryGtip.anti_dumping_applicable,
        anti_dumping_rate: countryGtip.anti_dumping_rate,
        surveillance_applicable: countryGtip.surveillance_applicable,
        surveillance_unit_value: countryGtip.surveillance_unit_value,
        vat_rate: countryGtip.vat_rate,
      }
    : gtipBase;

  const costs = computeCosts({
    basePrice,
    domesticCostPercent: domesticCostPercent ?? 0,
    weightKg,
    gtip: gtipToUse,
  });

  const customsFromGozetim = costs.customsFromGozetim;
  const addFromGozetim = costs.addFromGozetim;
  const customsFromAra = costs.customsFromAra;
  const addFromAra = costs.addFromAra;

  const vatBaseCandidates = [costs.gozetimliMatrah, costs.gozetimsizMatrah].filter(
    (v): v is number => v !== null
  );
  const vatBase = vatBaseCandidates.length ? Math.max(...vatBaseCandidates) : null;
  const vatRate = 0.2;
  const grossVatPayable = vatBase !== null ? vatBase * vatRate : null;

  const vatCreditBase =
    costs.araTutar !== null ? (costs.araTutar ?? 0) + (customsFromAra ?? 0) : null;
  const vatCredit = vatCreditBase !== null ? vatCreditBase * vatRate : null;
  const netVatPayable =
    grossVatPayable !== null ? Math.max(grossVatPayable - (vatCredit ?? 0), 0) : null;

  const subtotalBeforeVat =
    (costs.araTutar ?? 0) +
    (customsFromGozetim ?? 0) +
    (addFromGozetim ?? 0) +
    (costs.dumpingTutar ?? 0);

  const kdvBaseCandidates: number[] = [];
  if (costs.gozetimsizMatrah !== null) kdvBaseCandidates.push(costs.gozetimsizMatrah);
  kdvBaseCandidates.push(subtotalBeforeVat);
  const kdvBaz = kdvBaseCandidates.length ? Math.max(...kdvBaseCandidates) : null;

  const addDutyRate = Number((gtipToUse as any)?.additional_duty_rate ?? 0);
  const hasSurveillance = Boolean((gtipToUse as any)?.surveillance_applicable);
  const shouldAddNetVat = addDutyRate > 0 || hasSurveillance;
  const kdvSizMaliyet =
    kdvBaz !== null
      ? shouldAddNetVat
        ? netVatPayable !== null
          ? kdvBaz + netVatPayable
          : null
        : kdvBaz
      : null;
  const kdvLiMaliyet = kdvSizMaliyet !== null && vatCredit !== null ? kdvSizMaliyet + vatCredit : null;

  const warnings: string[] = [];
  if (!product.gtip_id) warnings.push("GTIP bagli degil");
  if (weightKg === null) warnings.push("Agirlik bulunamadi (niteliklerden)");
  if (basePrice === null) warnings.push("Birim fiyat yok (son siparis veya urun karti)");
  if (!selectedCountry) warnings.push("Maliyet ulkesi belirlenemedi");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">Urun maliyet</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">
            {product.name ?? product.code ?? "Urun"}
          </h1>
          <p className="text-sm text-black/60">GTIP baglanti: {gtipBase ? (gtipBase as any).code : "-"}</p>
          <p className="mt-1 inline-flex items-center gap-2 rounded-full border border-black/10 bg-[var(--sky)] px-3 py-1 text-xs font-semibold text-black/70">
            Maliyet ulkesi: {selectedCountry || "Belirlenemedi"}
          </p>
          {countryGtip ? <p className="text-xs text-black/60">Ulkeye ozel GTIP oranlari uygulaniyor.</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="text-xs font-semibold text-black/60">Ulke sec:</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="rounded-xl border border-black/10 px-3 py-2"
            >
              {availableCountries.length ? (
                availableCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              ) : (
                <option value="">Ulke tanimi yok</option>
              )}
            </select>
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--sand)] px-3 py-1 text-[11px] font-semibold text-black/70">
            <span>Ulke listesi:</span>
            <span className="text-black/80">{availableCountries.length ? availableCountries.join(", ") : "(yok)"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/products/${product.id}`}
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
          >
            Urun detaya don
          </Link>
        </div>
      </div>

      {warnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Eksikler: {warnings.join(", ")}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Girdi</h3>
          <div className="mt-3 grid gap-3 text-sm">
            <label className="text-black/70">
              Birim fiyat
              <input
                value={basePriceText}
                onChange={(e) => setBasePriceText(e.target.value)}
                className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
                placeholder="Orn: 12,345"
              />
            </label>
            <label className="text-black/70">
              Agirlik (kg)
              <input
                value={weightText}
                onChange={(e) => setWeightText(e.target.value)}
                className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
                placeholder="Orn: 1,250"
              />
            </label>
            <label className="text-black/70">
              Yurtici masraf (%)
              <input
                value={domesticCostText}
                onChange={(e) => setDomesticCostText(e.target.value)}
                className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
                placeholder="Orn: 12,5"
              />
            </label>
          </div>
          <dl className="mt-4 space-y-2 text-sm text-black/70">
            <div className="flex items-center justify-between">
              <dt>Yurtici masraf (%)</dt>
              <dd>{fmt(domesticCostPercent ?? product.domestic_cost_percent)}</dd>
            </div>
            {gtipToUse ? (
              <>
                <div className="flex items-center justify-between">
                  <dt>Gumruk vergisi (%)</dt>
                  <dd>{fmt((gtipToUse as any).customs_duty_rate)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Ilave GV (%)</dt>
                  <dd>{fmt((gtipToUse as any).additional_duty_rate)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Dumping</dt>
                  <dd>
                    {(gtipToUse as any).anti_dumping_applicable
                      ? `${fmt((gtipToUse as any).anti_dumping_rate)} /kg`
                      : "Yok"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Gozetim</dt>
                  <dd>
                    {(gtipToUse as any).surveillance_applicable
                      ? `${fmt((gtipToUse as any).surveillance_unit_value)} /kg`
                      : "Yok"}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>

        <div className="rounded-3xl border border-black/10 bg-[radial-gradient(circle_at_top_left,#fff,#f7f9fb)] p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Gozetimli matrah</h3>
          <dl className="mt-3 space-y-2 text-sm text-black/80">
            <div className="flex items-center justify-between">
              <dt>Gozetim tutari</dt>
              <dd>{fmt(costs.gozetim)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>GV ({fmt((gtipToUse as any)?.customs_duty_rate)}%)</dt>
              <dd>{fmt(customsFromGozetim)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Ilave GV ({fmt((gtipToUse as any)?.additional_duty_rate)}%)</dt>
              <dd>{fmt(addFromGozetim)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Dumping</dt>
              <dd>{fmt(costs.dumpingTutar)}</dd>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <dt>Toplam</dt>
              <dd>{fmt(costs.gozetimliMatrah)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-black/10 bg-[radial-gradient(circle_at_top_left,#fff,#f7f9fb)] p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Gozetimsiz matrah</h3>
          <dl className="mt-3 space-y-2 text-sm text-black/80">
            <div className="flex items-center justify-between">
              <dt>Masraf sonrasi birim</dt>
              <dd>{fmt(costs.araTutar)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>GV ({fmt((gtipToUse as any)?.customs_duty_rate)}%)</dt>
              <dd>{fmt(customsFromAra)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Ilave GV ({fmt((gtipToUse as any)?.additional_duty_rate)}%)</dt>
              <dd>{fmt(addFromAra)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Dumping</dt>
              <dd>{fmt(costs.dumpingTutar)}</dd>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <dt>Toplam</dt>
              <dd>{fmt(costs.gozetimsizMatrah)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">KDVsiz maliyet</h3>
          <dl className="mt-3 space-y-2 text-sm text-black/80">
            <div className="flex items-center justify-between">
              <dt>Baz adayi 1 (gozetimsiz matrah)</dt>
              <dd>{fmt(costs.gozetimsizMatrah)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Baz adayi 2 (ara+GV+Ilave GV+dumping)</dt>
              <dd>{fmt(subtotalBeforeVat)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Secilen baz (en yuksek)</dt>
              <dd>{fmt(kdvBaz)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Net KDV</dt>
              <dd>{fmt(netVatPayable)}</dd>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <dt>KDVsiz maliyet</dt>
              <dd>{fmt(kdvSizMaliyet)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">KDVli maliyet</h3>
          <dl className="mt-3 space-y-2 text-sm text-black/80">
            <div className="flex items-center justify-between">
              <dt>KDVsiz maliyet</dt>
              <dd>{fmt(kdvSizMaliyet)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>KDV indirimi (kredi)</dt>
              <dd>{fmt(vatCredit)}</dd>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <dt>KDVli maliyet</dt>
              <dd>{fmt(kdvLiMaliyet)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <p className="text-xs text-black/50">
        Bu sayfa "FEATURE: product-cost/gtip" kapsaminda. Kaldirmak icin dosyayi ve ilgili migrationu silmeniz yeterli.
      </p>
    </section>
  );
}
