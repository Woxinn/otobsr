"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GtipRow } from "@/lib/gtipCost";
import { calculateDisplayedNetCost, resolveGtipForCountry, type CountryRateRow } from "@/lib/productCostDisplay";

type CountryRate = CountryRateRow;

type ProductSummary = {
  id: string;
  name: string | null;
  code: string | null;
  gtip_id: string | null;
  domestic_cost_percent: number | null;
};

type CostDataPayload = {
  product: ProductSummary;
  gtipBase: GtipRow | null;
  countryRates: CountryRate[];
  availableCountries: string[];
  initialCountry: string | null;
  initialBasePrice: number | null;
  initialWeightKg: number | null;
};

type ProductSearchItem = { id: string; code: string | null; name: string | null };

type StoredProduct = { id: string; code: string | null; name: string | null; updatedAt: number };

type Props = CostDataPayload;

const RECENT_KEY = "product-cost-recent-v1";
const FAVORITE_KEY = "product-cost-favorite-v1";
const MAX_STORED = 10;

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

const sanitizeNumericInput = (value: string) => value.replace(/[^0-9,]/g, "");

const formatInputNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return Number(value).toLocaleString("tr-TR", {
    useGrouping: false,
    maximumFractionDigits: 6,
  });
};

const parseStored = (raw: string | null): StoredProduct[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === "string")
      .map((item) => ({
        id: item.id,
        code: typeof item.code === "string" ? item.code : null,
        name: typeof item.name === "string" ? item.name : null,
        updatedAt: Number(item.updatedAt) || Date.now(),
      }));
  } catch {
    return [];
  }
};

const upsertStored = (list: StoredProduct[], item: StoredProduct) =>
  [item, ...list.filter((x) => x.id !== item.id)].slice(0, MAX_STORED);

const normalizeForSearch = (value: string | null | undefined) =>
  (value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export default function ProductCostCalculatorClient(initial: Props) {
  const [data, setData] = useState<CostDataPayload>(initial);
  const [selectedCountry, setSelectedCountry] = useState(initial.initialCountry ?? initial.availableCountries[0] ?? "");
  const [basePriceText, setBasePriceText] = useState(formatInputNumber(initial.initialBasePrice));
  const [weightText, setWeightText] = useState(formatInputNumber(initial.initialWeightKg));
  const [domesticCostText, setDomesticCostText] = useState(formatInputNumber(initial.product.domestic_cost_percent));
  const [marginText, setMarginText] = useState("0");
  const [countryPriceTexts, setCountryPriceTexts] = useState<Record<string, string>>({});

  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [recentProducts, setRecentProducts] = useState<StoredProduct[]>([]);
  const [favoriteProducts, setFavoriteProducts] = useState<StoredProduct[]>([]);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelectedCountry(data.initialCountry ?? data.availableCountries[0] ?? "");
    setBasePriceText(formatInputNumber(data.initialBasePrice));
    setWeightText(formatInputNumber(data.initialWeightKg));
    setDomesticCostText(formatInputNumber(data.product.domestic_cost_percent));
    setCountryPriceTexts(
      Object.fromEntries(
        data.availableCountries.map((country) => [country, formatInputNumber(data.initialBasePrice)])
      )
    );
  }, [data]);

  useEffect(() => {
    const recent = parseStored(window.localStorage.getItem(RECENT_KEY));
    const favorites = parseStored(window.localStorage.getItem(FAVORITE_KEY));
    setRecentProducts(recent);
    setFavoriteProducts(favorites);
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const query = searchText.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query, limit: "200" });
        const res = await fetch(`/api/products/search?${params.toString()}`, { method: "GET" });
        if (!res.ok) throw new Error(await res.text());
        const body = (await res.json()) as { items?: ProductSearchItem[] };
        const tokens = normalizeForSearch(query).split(/\s+/).filter(Boolean);
        const items = (body.items ?? [])
          .filter((item) => item.id !== data.product.id)
          .map((item) => {
            const code = normalizeForSearch(item.code);
            const name = normalizeForSearch(item.name);
            const haystack = `${code} ${name}`.trim();
            const allMatched = tokens.every((token) => haystack.includes(token));
            const codeStarts = tokens.some((token) => code.startsWith(token));
            const codeFull = tokens.every((token) => code.includes(token));
            const score = (allMatched ? 100 : 0) + (codeFull ? 25 : 0) + (codeStarts ? 10 : 0);
            return { item, allMatched, score };
          })
          .filter((row) => row.allMatched)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map((row) => row.item);
        setSearchResults(items);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchText, data.product.id]);

  const persistRecents = (list: StoredProduct[]) => {
    setRecentProducts(list);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  };

  const persistFavorites = (list: StoredProduct[]) => {
    setFavoriteProducts(list);
    window.localStorage.setItem(FAVORITE_KEY, JSON.stringify(list));
  };

  const markRecent = (payload: CostDataPayload) => {
    const next = upsertStored(recentProducts, {
      id: payload.product.id,
      code: payload.product.code,
      name: payload.product.name,
      updatedAt: Date.now(),
    });
    persistRecents(next);
  };

  const toggleFavorite = () => {
    const existing = favoriteProducts.some((x) => x.id === data.product.id);
    if (existing) {
      persistFavorites(favoriteProducts.filter((x) => x.id !== data.product.id));
      return;
    }
    const next = upsertStored(favoriteProducts, {
      id: data.product.id,
      code: data.product.code,
      name: data.product.name,
      updatedAt: Date.now(),
    });
    persistFavorites(next);
  };

  const loadProduct = async (productId: string) => {
    if (!productId || productId === data.product.id) return;
    setLoadingProduct(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ id: productId });
      const res = await fetch(`/api/products/cost-data?${params.toString()}`, { method: "GET" });
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as CostDataPayload;
      if (!payload?.product?.id) throw new Error("Gecerli urun verisi yok");
      setData(payload);
      markRecent(payload);
      setSearchText("");
      setSearchResults([]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Urun yuklenemedi");
    } finally {
      setLoadingProduct(false);
    }
  };

  const basePrice = parseInputNumber(basePriceText);
  const weightKg = parseInputNumber(weightText);
  const domesticCostPercent = parseInputNumber(domesticCostText);
  const marginPercent = parseInputNumber(marginText) ?? 0;

  const countryGtip = data.countryRates.find((c) => c.country === selectedCountry) ?? null;
  const gtipToUse: GtipRow | null = resolveGtipForCountry(data.gtipBase, data.countryRates, selectedCountry);
  const { netCost: kdvSizMaliyet, costs } = calculateDisplayedNetCost({
    basePrice,
    domesticCostPercent: domesticCostPercent ?? 0,
    weightKg,
    gtipBase: data.gtipBase,
    countryRates: data.countryRates,
    selectedCountry,
  });

  const customsFromGozetim = costs.customsFromGozetim;
  const addFromGozetim = costs.addFromGozetim;
  const customsFromAra = costs.customsFromAra;
  const addFromAra = costs.addFromAra;

  const vatBaseCandidates = [costs.gozetimliMatrah, costs.gozetimsizMatrah].filter((v): v is number => v !== null);
  const vatBase = vatBaseCandidates.length ? Math.max(...vatBaseCandidates) : null;
  const vatRate = 0.2;
  const grossVatPayable = vatBase !== null ? vatBase * vatRate : null;
  const vatCreditBase = costs.araTutar !== null ? (costs.araTutar ?? 0) + (customsFromAra ?? 0) : null;
  const vatCredit = vatCreditBase !== null ? vatCreditBase * vatRate : null;
  const netVatPayable = grossVatPayable !== null ? Math.max(grossVatPayable - (vatCredit ?? 0), 0) : null;

  const subtotalBeforeVat =
    (costs.araTutar ?? 0) + (customsFromGozetim ?? 0) + (addFromGozetim ?? 0) + (costs.dumpingTutar ?? 0);

  const kdvBaseCandidates: number[] = [];
  if (costs.gozetimsizMatrah !== null) kdvBaseCandidates.push(costs.gozetimsizMatrah);
  kdvBaseCandidates.push(subtotalBeforeVat);
  const kdvBaz = kdvBaseCandidates.length ? Math.max(...kdvBaseCandidates) : null;

  const kdvLiMaliyet = kdvSizMaliyet !== null && vatCredit !== null ? kdvSizMaliyet + vatCredit : null;
  const sellingPrice = kdvSizMaliyet !== null ? kdvSizMaliyet * (1 + marginPercent / 100) : null;

  const warnings: string[] = [];
  if (!data.product.gtip_id) warnings.push("GTIP bagli degil");
  if (weightKg === null) warnings.push("Agirlik bulunamadi (niteliklerden)");
  if (basePrice === null) warnings.push("Birim fiyat yok (son siparis veya urun karti)");
  if (!selectedCountry) warnings.push("Maliyet ulkesi belirlenemedi");

  const isFavorite = favoriteProducts.some((x) => x.id === data.product.id);
  const quickList = useMemo(() => {
    const dedup = new Map<string, StoredProduct>();
    [...favoriteProducts, ...recentProducts].forEach((item) => {
      if (item.id !== data.product.id && !dedup.has(item.id)) dedup.set(item.id, item);
    });
    return Array.from(dedup.values()).slice(0, 8);
  }, [favoriteProducts, recentProducts, data.product.id]);

  const netCostByCountry = useMemo(() => {
    if (!data.availableCountries.length) return [];
    return data.availableCountries.map((country) => {
      const countryBasePrice = parseInputNumber(countryPriceTexts[country] ?? "") ?? basePrice;
      const result = calculateDisplayedNetCost({
        basePrice: countryBasePrice,
        domesticCostPercent: domesticCostPercent ?? 0,
        weightKg,
        gtipBase: data.gtipBase,
        countryRates: data.countryRates,
        selectedCountry: country,
      });
      return {
        country,
        basePrice: countryBasePrice,
        netCost: result.netCost,
        sellingPrice: result.netCost !== null ? result.netCost * (1 + marginPercent / 100) : null,
      };
    });
  }, [data.availableCountries, basePrice, domesticCostPercent, weightKg, data.gtipBase, data.countryRates, countryPriceTexts, marginPercent]);

  const applyGlobalBaseToAllCountries = () => {
    setCountryPriceTexts(
      Object.fromEntries(
        data.availableCountries.map((country) => [country, basePriceText])
      )
    );
  };

  return (
    <section className="space-y-6 pb-28">
      <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.25em] text-black/45">Hizli urun gecisi</p>
        <div className="mt-2 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Urun kodu veya adi ara"
              className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2 text-xs">
              {searching ? <span className="rounded-full bg-black/5 px-2 py-1">Araniyor...</span> : null}
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => loadProduct(item.id)}
                  disabled={loadingProduct}
                  className="rounded-full border border-black/15 px-3 py-1 text-left hover:border-black/30 disabled:opacity-60"
                >
                  {(item.code ?? "-") + " - " + (item.name ?? "Adsiz")}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={toggleFavorite}
              className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                isFavorite ? "border-amber-300 bg-amber-50 text-amber-700" : "border-black/15 text-black/70"
              }`}
            >
              {isFavorite ? "Favoriden cikar" : "Favoriye ekle"}
            </button>
            <Link href={`/products/${data.product.id}`} className="rounded-full border border-black/15 px-3 py-2 text-xs font-semibold">
              Urun detayina don
            </Link>
          </div>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <div className="rounded-2xl border border-black/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/45">Favoriler</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {favoriteProducts.length ? (
                favoriteProducts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadProduct(item.id)}
                    className="rounded-full border border-black/15 px-3 py-1 text-xs"
                  >
                    {(item.code ?? "-") + " - " + (item.name ?? "")}
                  </button>
                ))
              ) : (
                <span className="text-xs text-black/50">Favori urun yok</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/45">Son kullanilanlar</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {recentProducts.length ? (
                recentProducts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadProduct(item.id)}
                    className="rounded-full border border-black/15 px-3 py-1 text-xs"
                  >
                    {(item.code ?? "-") + " - " + (item.name ?? "")}
                  </button>
                ))
              ) : (
                <span className="text-xs text-black/50">Kayit yok</span>
              )}
            </div>
          </div>
        </div>

        {loadError ? <p className="mt-3 text-xs text-red-600">{loadError}</p> : null}
        {loadingProduct ? <p className="mt-3 text-xs text-black/60">Urun verisi yukleniyor...</p> : null}
        {quickList.length ? (
          <p className="mt-3 text-xs text-black/50">Hizli liste hazir: {quickList.length} urun</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">Urun maliyet</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">{data.product.name ?? data.product.code ?? "Urun"}</h1>
          <p className="text-sm text-black/60">GTIP baglanti: {data.gtipBase ? (data.gtipBase as any).code : "-"}</p>
          <p className="mt-1 inline-flex items-center gap-2 rounded-full border border-black/10 bg-[var(--sky)] px-3 py-1 text-xs font-semibold text-black/70">
            Maliyet ulkesi: {selectedCountry || "Belirlenemedi"}
          </p>
          {countryGtip ? <p className="text-xs text-black/60">Ulkeye ozel GTIP oranlari uygulaniyor.</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="text-xs font-semibold text-black/60">Ulke sec:</label>
            <select value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)} className="rounded-xl border border-black/10 px-3 py-2">
              {data.availableCountries.length ? (
                data.availableCountries.map((c) => (
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
            <span className="text-black/80">{data.availableCountries.length ? data.availableCountries.join(", ") : "(yok)"}</span>
          </div>
        </div>
      </div>

      {warnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Eksikler: {warnings.join(", ")}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Girdi</h3>
          <div className="mt-3 grid gap-3 text-sm">
            <label className="text-black/70">
              Birim fiyat
              <input
                value={basePriceText}
                onChange={(e) => setBasePriceText(sanitizeNumericInput(e.target.value))}
                inputMode="decimal"
                pattern="[0-9,]*"
                className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
                placeholder="Orn: 12,345"
              />
            </label>
            <label className="text-black/70">
              Agirlik (kg)
              <input
                value={weightText}
                onChange={(e) => setWeightText(sanitizeNumericInput(e.target.value))}
                inputMode="decimal"
                pattern="[0-9,]*"
                className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
                placeholder="Orn: 1,250"
              />
            </label>
            <label className="text-black/70">
              Yurtici masraf (%)
              <input
                value={domesticCostText}
                onChange={(e) => setDomesticCostText(sanitizeNumericInput(e.target.value))}
                inputMode="decimal"
                pattern="[0-9,]*"
                className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
                placeholder="Orn: 12,5"
              />
            </label>
            <label className="text-black/70">
              Kar marji (%)
              <input
                value={marginText}
                onChange={(e) => setMarginText(sanitizeNumericInput(e.target.value))}
                inputMode="decimal"
                pattern="[0-9,]*"
                className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
                placeholder="Orn: 25"
              />
            </label>
          </div>
          <dl className="mt-4 space-y-2 text-sm text-black/70">
            <div className="flex items-center justify-between">
              <dt>Yurtici masraf (%)</dt>
              <dd>{fmt(domesticCostPercent ?? data.product.domestic_cost_percent)}</dd>
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
                  <dd>{(gtipToUse as any).anti_dumping_applicable ? `${fmt((gtipToUse as any).anti_dumping_rate)} /kg` : "Yok"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Gozetim</dt>
                  <dd>
                    {(gtipToUse as any).surveillance_applicable ? `${fmt((gtipToUse as any).surveillance_unit_value)} /kg` : "Yok"}
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
            <div className="flex items-center justify-between">
              <dt>Kar marji (%)</dt>
              <dd>{fmt(marginPercent)}</dd>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <dt>KDVsiz maliyet</dt>
              <dd>{fmt(kdvSizMaliyet)}</dd>
            </div>
            <div className="flex items-center justify-between font-semibold text-[var(--ocean)]">
              <dt>Satis fiyati</dt>
              <dd>{fmt(sellingPrice)}</dd>
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

      <div className="fixed bottom-3 left-1/2 z-40 w-[min(1240px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-black/10 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.25em] text-black/45">Ulke bazli KDVsiz maliyet</p>
          <p className="text-xs font-semibold text-black/70">
            {(data.product.code ?? "-") + " - " + (data.product.name ?? "Adsiz urun")}
          </p>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {netCostByCountry.length ? (
            netCostByCountry.map((item) => (
              <div
                key={item.country}
                className={`min-w-[168px] rounded-xl border px-3 py-2 text-xs ${
                  item.country === selectedCountry
                    ? "border-[var(--ocean)] bg-[var(--ocean)]/5"
                    : "border-black/10 bg-white"
                }`}
              >
                <p className="font-semibold text-black/70">{item.country}</p>
                <input
                  value={countryPriceTexts[item.country] ?? ""}
                  onChange={(e) =>
                    setCountryPriceTexts((prev) => ({
                      ...prev,
                      [item.country]: sanitizeNumericInput(e.target.value),
                    }))
                  }
                  inputMode="decimal"
                  pattern="[0-9,]*"
                  className="mt-1 w-full rounded-lg border border-black/15 px-2 py-1 text-xs"
                  placeholder="Birim fiyat"
                />
                <p className="mt-1 text-sm font-semibold text-black">{fmt(item.netCost)}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--ocean)]">Satis: {fmt(item.sellingPrice)}</p>
              </div>
            ))
          ) : (
            <span className="text-xs text-black/50">Ulke bazli oran kaydi yok</span>
          )}
        </div>
        {netCostByCountry.length ? (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={applyGlobalBaseToAllCountries}
              className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold text-black/70"
            >
              Genel birim fiyati tum ulkelere uygula
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
