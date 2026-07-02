"use client";

import React, { useState, useEffect, useMemo, useTransition, useRef } from "react";
import type { GtipRow } from "@/lib/gtipCost";
import { getGtipDetailsWithRates } from "@/app/actions/gtips";
import {
  Calculator,
  Search,
  Building2,
  Percent,
  Coins,
  Scale,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Globe,
  TrendingUp,
  TrendingDown,
  Info,
  ChevronRight,
  Plus
} from "lucide-react";

interface Props {
  gtips: GtipRow[];
  availableCountries: string[];
}

type ProductSearchItem = { id: string; code: string | null; name: string | null };

const fmt = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
};

const parseInputNumber = (value: string) => {
  const raw = value.trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
};

const sanitizeNumericInput = (value: string) => value.replace(/[^0-9,]/g, "");

const formatInputNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) return "";
  return Number(value).toLocaleString("tr-TR", {
    useGrouping: false,
    maximumFractionDigits: 4,
  });
};

export default function ImportCostCalculatorClient({ gtips, availableCountries }: Props) {
  const [isPending, startTransition] = useTransition();

  // Mode: "gtip" (using DB values) or "manual" (using overridden inputs)
  const [calculationMode, setCalculationMode] = useState<"gtip" | "manual">("gtip");

  // Shared inputs
  const [basePriceText, setBasePriceText] = useState("10");
  const [weightText, setWeightText] = useState("1");
  const [domesticCostText, setDomesticCostText] = useState("5"); // default 5% domestic cost
  const [marginText, setMarginText] = useState("20"); // default 20% margin

  // Product Autocomplete Search States
  const [productQuery, setProductQuery] = useState("");
  const [productSearchResults, setProductSearchResults] = useState<ProductSearchItem[]>([]);
  const [searchingProduct, setSearchingProduct] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchItem | null>(null);

  // GTIP Autocomplete States
  const [gtipQuery, setGtipQuery] = useState("");
  const [selectedGtip, setSelectedGtip] = useState<GtipRow | null>(null);
  const [isGtipDropdownOpen, setIsGtipDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Active GTIP Details & Country-Specific Rates (Fetched from Server Action)
  const [activeGtip, setActiveGtip] = useState<GtipRow | null>(null);
  const [activeCountryRates, setActiveCountryRates] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState(availableCountries[0] ?? "");
  const [allowGtipOverride, setAllowGtipOverride] = useState(false);

  // Manual Rates Inputs (used in "manual" mode, or when override is active in "gtip" mode)
  const [manualCustomsDuty, setManualCustomsDuty] = useState("0");
  const [manualAdditionalDuty, setManualAdditionalDuty] = useState("0");
  const [manualAntiDumping, setManualAntiDumping] = useState("0");
  const [manualSurveillance, setManualSurveillance] = useState("0");
  const [manualVatRate, setManualVatRate] = useState("20");

  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Filter GTIP list by query
  const filteredGtips = useMemo(() => {
    const q = gtipQuery.trim().toLowerCase();
    if (!q) return gtips.slice(0, 10);
    return gtips
      .filter((g) => g.code.toLowerCase().includes(q) || (g.description ?? "").toLowerCase().includes(q))
      .slice(0, 15);
  }, [gtips, gtipQuery]);

  // Product Search handler
  useEffect(() => {
    const query = productQuery.trim();
    if (query.length < 2) {
      setProductSearchResults([]);
      setSearchingProduct(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingProduct(true);
      try {
        const params = new URLSearchParams({ q: query, limit: "10" });
        const res = await fetch(`/api/products/search?${params.toString()}`);
        if (!res.ok) throw new Error();
        const body = await res.json();
        setProductSearchResults(body.items ?? []);
      } catch {
        setProductSearchResults([]);
      } finally {
        setSearchingProduct(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [productQuery]);

  // Handle GTIP Selection change (load details & country rates)
  const loadGtipRates = (gtip: GtipRow) => {
    setSelectedGtip(gtip);
    setGtipQuery(gtip.code);
    setIsGtipDropdownOpen(false);

    startTransition(async () => {
      try {
        const { gtip: details, countryRates } = await getGtipDetailsWithRates(gtip.id);
        if (details) {
          setActiveGtip(details as unknown as GtipRow);
          setActiveCountryRates(countryRates);

          // Prepopulate manual input overrides with GTIP default values
          setManualCustomsDuty(formatInputNumber(details.customs_duty_rate));
          setManualAdditionalDuty(formatInputNumber(details.additional_duty_rate));
          setManualAntiDumping(formatInputNumber(details.anti_dumping_rate));
          setManualSurveillance(formatInputNumber(details.surveillance_unit_value));
          setManualVatRate(formatInputNumber(details.vat_rate ?? 20));
        }
      } catch (err) {
        console.error("GTIP rates load error", err);
      }
    });
  };

  // Close GTIP dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsGtipDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Pre-fill from Product
  const loadProductData = async (productId: string) => {
    setSearchingProduct(false);
    setProductQuery("");
    setProductSearchResults([]);

    try {
      const params = new URLSearchParams({ id: productId });
      const res = await fetch(`/api/products/cost-data?${params.toString()}`);
      if (!res.ok) throw new Error("Ürün verileri alınamadı.");
      const payload = await res.json();

      if (payload?.product) {
        setSelectedProduct(payload.product);
        setBasePriceText(formatInputNumber(payload.initialBasePrice ?? 10));
        setWeightText(formatInputNumber(payload.initialWeightKg ?? 1));
        setDomesticCostText(formatInputNumber(payload.product.domestic_cost_percent ?? 5));

        setNotification({
          type: "success",
          message: `"${payload.product.code} - ${payload.product.name}" kart verileri başarıyla dolduruldu!`,
        });

        // If product has GTIP, load it
        if (payload.gtipBase) {
          setCalculationMode("gtip");
          setSelectedGtip(payload.gtipBase);
          setGtipQuery(payload.gtipBase.code);
          setActiveGtip(payload.gtipBase);
          setActiveCountryRates(payload.countryRates ?? []);
          if (payload.initialCountry) {
            setSelectedCountry(payload.initialCountry);
          }
        }
      }
    } catch (err: any) {
      setNotification({ type: "error", message: err.message ?? "Bir hata oluştu." });
    }
  };

  // Clean all inputs / Reset
  const handleReset = () => {
    setSelectedProduct(null);
    setSelectedGtip(null);
    setGtipQuery("");
    setActiveGtip(null);
    setActiveCountryRates([]);
    setBasePriceText("10");
    setWeightText("1");
    setDomesticCostText("5");
    setMarginText("20");
    setManualCustomsDuty("0");
    setManualAdditionalDuty("0");
    setManualAntiDumping("0");
    setManualSurveillance("0");
    setManualVatRate("20");
    setNotification(null);
  };

  // Perform Calculations
  const calculations = useMemo(() => {
    const basePrice = parseInputNumber(basePriceText);
    const weightKg = parseInputNumber(weightText);
    const domesticPct = parseInputNumber(domesticCostText);
    const marginPct = parseInputNumber(marginText);

    // Resolve rates based on mode
    let customsRate = 0;
    let addRate = 0;
    let dumpRate = 0;
    let survValue = 0;
    let vatRate = 20;

    let hasSurveillance = false;
    let hasAntiDumping = false;
    let activeGtipCode = "-";

    if (calculationMode === "gtip" && activeGtip) {
      activeGtipCode = activeGtip.code;
      // Fetch country-specific rate override if exists
      const countryOverride = activeCountryRates.find((c) => c.country === selectedCountry);

      customsRate = countryOverride?.customs_duty_rate ?? activeGtip.customs_duty_rate ?? 0;
      addRate = countryOverride?.additional_duty_rate ?? activeGtip.additional_duty_rate ?? 0;
      dumpRate = countryOverride?.anti_dumping_rate ?? activeGtip.anti_dumping_rate ?? 0;
      survValue = countryOverride?.surveillance_unit_value ?? activeGtip.surveillance_unit_value ?? 0;
      vatRate = countryOverride?.vat_rate ?? activeGtip.vat_rate ?? 20;

      hasSurveillance = countryOverride
        ? Boolean(countryOverride.surveillance_applicable)
        : Boolean(activeGtip.surveillance_applicable);
      hasAntiDumping = countryOverride
        ? Boolean(countryOverride.anti_dumping_applicable)
        : Boolean(activeGtip.anti_dumping_applicable);

      // If overrides allowed, merge overrides
      if (allowGtipOverride) {
        customsRate = parseInputNumber(manualCustomsDuty);
        addRate = parseInputNumber(manualAdditionalDuty);
        dumpRate = parseInputNumber(manualAntiDumping);
        survValue = parseInputNumber(manualSurveillance);
        vatRate = parseInputNumber(manualVatRate);
      }
    } else {
      // Manual mode
      customsRate = parseInputNumber(manualCustomsDuty);
      addRate = parseInputNumber(manualAdditionalDuty);
      dumpRate = parseInputNumber(manualAntiDumping);
      survValue = parseInputNumber(manualSurveillance);
      vatRate = parseInputNumber(manualVatRate);

      hasSurveillance = survValue > 0;
      hasAntiDumping = dumpRate > 0;
    }

    // Formulas:
    const araTutar = basePrice * (1 + domesticPct / 100);
    const dumpingTutar = hasAntiDumping ? dumpRate * weightKg : 0;
    const gozetim = hasSurveillance ? survValue * weightKg : 0;

    const customsFromGozetim = hasSurveillance ? gozetim * (customsRate / 100) : 0;
    const addFromGozetim = hasSurveillance ? gozetim * (addRate / 100) : 0;

    const gozetimliMatrah = hasSurveillance
      ? gozetim + customsFromGozetim + addFromGozetim + dumpingTutar
      : 0;

    const customsFromAra = araTutar * (customsRate / 100);
    const addFromAra = araTutar * (addRate / 100);
    const gozetimsizMatrah = araTutar + customsFromAra + addFromAra + dumpingTutar;

    // VAT (KDV)
    const vatBaseCandidates = [gozetimsizMatrah];
    if (hasSurveillance) vatBaseCandidates.push(gozetimliMatrah);
    const vatBase = Math.max(...vatBaseCandidates);

    const grossVatPayable = vatBase * (vatRate / 100);
    const vatCreditBase = araTutar + customsFromAra;
    const vatCredit = vatCreditBase * (vatRate / 100);
    const netVatPayable = Math.max(grossVatPayable - vatCredit, 0);

    // KDVsiz Maliyet (Net Cost)
    const subtotalBeforeVat = hasSurveillance
      ? araTutar + customsFromGozetim + addFromGozetim + dumpingTutar
      : gozetimsizMatrah;

    const kdvBaseCandidates = [gozetimsizMatrah, subtotalBeforeVat];
    const kdvBaz = Math.max(...kdvBaseCandidates);

    const shouldAddNetVat = addRate > 0 || hasSurveillance;
    const netCost = shouldAddNetVat ? kdvBaz + netVatPayable : kdvBaz;

    const sellingPrice = netCost * (1 + marginPct / 100);
    const kdvLiMaliyet = netCost + vatCredit;
    const karTutari = sellingPrice - netCost;

    return {
      activeGtipCode,
      customsRate,
      addRate,
      dumpRate,
      survValue,
      vatRate,
      hasSurveillance,
      hasAntiDumping,

      araTutar,
      dumpingTutar,
      gozetim,
      customsFromGozetim,
      addFromGozetim,
      gozetimliMatrah,
      customsFromAra,
      addFromAra,
      gozetimsizMatrah,
      vatBase,
      grossVatPayable,
      vatCredit,
      netVatPayable,
      netCost,
      sellingPrice,
      kdvLiMaliyet,
      karTutari,
    };
  }, [
    calculationMode,
    activeGtip,
    activeCountryRates,
    selectedCountry,
    allowGtipOverride,
    basePriceText,
    weightText,
    domesticCostText,
    marginText,
    manualCustomsDuty,
    manualAdditionalDuty,
    manualAntiDumping,
    manualSurveillance,
    manualVatRate,
  ]);

  // Compute alternative country costs for grid comparison
  const countryComparison = useMemo(() => {
    if (calculationMode !== "gtip" || !activeGtip) return [];

    const basePrice = parseInputNumber(basePriceText);
    const weightKg = parseInputNumber(weightText);
    const domesticPct = parseInputNumber(domesticCostText);
    const marginPct = parseInputNumber(marginText);

    return availableCountries.map((country) => {
      const countryOverride = activeCountryRates.find((c) => c.country === country);

      const customsRate = countryOverride?.customs_duty_rate ?? activeGtip.customs_duty_rate ?? 0;
      const addRate = countryOverride?.additional_duty_rate ?? activeGtip.additional_duty_rate ?? 0;
      const dumpRate = countryOverride?.anti_dumping_rate ?? activeGtip.anti_dumping_rate ?? 0;
      const survValue = countryOverride?.surveillance_unit_value ?? activeGtip.surveillance_unit_value ?? 0;
      const vatRate = countryOverride?.vat_rate ?? activeGtip.vat_rate ?? 20;

      const hasSurveillance = countryOverride
        ? Boolean(countryOverride.surveillance_applicable)
        : Boolean(activeGtip.surveillance_applicable);
      const hasAntiDumping = countryOverride
        ? Boolean(countryOverride.anti_dumping_applicable)
        : Boolean(activeGtip.anti_dumping_applicable);

      const araTutar = basePrice * (1 + domesticPct / 100);
      const dumpingTutar = hasAntiDumping ? dumpRate * weightKg : 0;
      const gozetim = hasSurveillance ? survValue * weightKg : 0;

      const customsFromGozetim = hasSurveillance ? gozetim * (customsRate / 100) : 0;
      const addFromGozetim = hasSurveillance ? gozetim * (addRate / 100) : 0;

      const gozetimliMatrah = hasSurveillance
        ? gozetim + customsFromGozetim + addFromGozetim + dumpingTutar
        : 0;

      const customsFromAra = araTutar * (customsRate / 100);
      const addFromAra = araTutar * (addRate / 100);
      const gozetimsizMatrah = araTutar + customsFromAra + addFromAra + dumpingTutar;

      const vatBaseCandidates = [gozetimsizMatrah];
      if (hasSurveillance) vatBaseCandidates.push(gozetimliMatrah);
      const vatBase = Math.max(...vatBaseCandidates);

      const grossVatPayable = vatBase * (vatRate / 100);
      const vatCreditBase = araTutar + customsFromAra;
      const vatCredit = vatCreditBase * (vatRate / 100);
      const netVatPayable = Math.max(grossVatPayable - vatCredit, 0);

      const subtotalBeforeVat = hasSurveillance
        ? araTutar + customsFromGozetim + addFromGozetim + dumpingTutar
        : gozetimsizMatrah;

      const kdvBaseCandidates = [gozetimsizMatrah, subtotalBeforeVat];
      const kdvBaz = Math.max(...kdvBaseCandidates);

      const shouldAddNetVat = addRate > 0 || hasSurveillance;
      const netCost = shouldAddNetVat ? kdvBaz + netVatPayable : kdvBaz;
      const sellingPrice = netCost * (1 + marginPct / 100);

      return {
        country,
        netCost,
        sellingPrice,
      };
    });
  }, [calculationMode, activeGtip, activeCountryRates, basePriceText, weightText, domesticCostText, marginText, availableCountries]);

  return (
    <section className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600">
              <Calculator className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 [font-family:var(--font-display)]">
              İthalat Maliyet Hesaplayıcı
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            GTİP kodları, ülke bazlı vergi matrahları veya tamamen manuel oranlar üzerinden ithalat maliyeti simülasyonu yapın.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Sıfırla
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border p-4 text-xs transition-all duration-300 ${
            notification.type === "success"
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-red-100 bg-red-50 text-red-800"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4.5 w-4.5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-semibold">{notification.message}</div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            kapat
          </button>
        </div>
      )}

      {/* Main Grid: Inputs on Left, Results on Right */}
      <div className="grid gap-6 lg:grid-cols-12">
        
        {/* LEFT COLUMN: INPUTS (7 Columns) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Card 1: Quick Search Autocomplete */}
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-indigo-500">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-4">
              <Search className="h-4 w-4 text-slate-400" />
              Hızlı Bilgi Doldurma (Ürün / Kart Seçimi)
            </h3>
            
            <div className="space-y-4">
              {/* Product search */}
              <div className="space-y-1.5">
                <label htmlFor="productSearch" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Katalogdan Ürün Ara
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    id="productSearch"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Doldurmak için ürün kodu veya adı yazın..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
                  />
                  {searchingProduct && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      Aranıyor...
                    </span>
                  )}
                </div>

                {/* Results dropdown */}
                {productSearchResults.length > 0 && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-150 bg-white shadow-lg text-xs divide-y divide-slate-100 z-50 absolute w-[calc(100%-40px)] lg:w-[calc(56%)]">
                    {productSearchResults.map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => loadProductData(prod.id)}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition cursor-pointer flex justify-between items-center"
                      >
                        <span className="font-semibold text-slate-800">
                          {prod.code}
                        </span>
                        <span className="text-slate-500 truncate max-w-[200px]">
                          {prod.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selection summary */}
              {selectedProduct && (
                <div className="flex items-center justify-between rounded-lg bg-indigo-50/40 border border-indigo-100 px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="rounded bg-indigo-100 p-1 text-indigo-700">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Seçili Ürün Kartı
                      </p>
                      <p className="text-xs text-slate-500 font-medium">
                        {selectedProduct.code} - {selectedProduct.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                  >
                    Kaldır
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Calculation Settings */}
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-teal-500">
            {/* Tab buttons */}
            <div className="flex border-b border-slate-100 pb-3 mb-4">
              <button
                type="button"
                onClick={() => setCalculationMode("gtip")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  calculationMode === "gtip"
                    ? "bg-teal-50 text-teal-700 shadow-sm"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                GTİP ile Otomatik Hesaplama
              </button>
              <button
                type="button"
                onClick={() => setCalculationMode("manual")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  calculationMode === "manual"
                    ? "bg-teal-50 text-teal-700 shadow-sm"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                Manuel Oranlar
              </button>
            </div>

            <div className="space-y-4">
              
              {/* GTIP SPECIFIC INPUTS */}
              {calculationMode === "gtip" && (
                <div className="space-y-4">
                  {/* GTIP search */}
                  <div className="space-y-1.5 relative" ref={dropdownRef}>
                    <label htmlFor="gtipSearch" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      GTİP Kodu veya Tanımı
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <Scale className="h-4 w-4" />
                      </span>
                      <input
                        id="gtipSearch"
                        value={gtipQuery}
                        onChange={(e) => {
                          setGtipQuery(e.target.value);
                          setIsGtipDropdownOpen(true);
                        }}
                        onFocus={() => setIsGtipDropdownOpen(true)}
                        placeholder="Örn: 8708.29.90..."
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
                      />
                    </div>

                    {isGtipDropdownOpen && filteredGtips.length > 0 && (
                      <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-150 bg-white shadow-xl text-xs divide-y divide-slate-100">
                        {filteredGtips.map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => loadGtipRates(g)}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-teal-50/55 transition cursor-pointer flex flex-col gap-0.5"
                          >
                            <span className="font-bold text-slate-900 text-xs">
                              {g.code}
                            </span>
                            <span className="text-slate-500 truncate w-full text-[10px]">
                              {g.description ?? "Açıklama yok"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Country Selection */}
                  {activeGtip && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="countrySelect" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          İthalat Ülkesi
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                            <Globe className="h-4 w-4" />
                          </span>
                          <select
                            id="countrySelect"
                            value={selectedCountry}
                            onChange={(e) => setSelectedCountry(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200 appearance-none"
                          >
                            {availableCountries.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowGtipOverride}
                            onChange={(e) => setAllowGtipOverride(e.target.checked)}
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
                          />
                          Oranları Elle Düzenlemeye İzin Ver
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Active rates info box */}
                  {activeGtip && !allowGtipOverride && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-xs space-y-2">
                      <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                        Uygulanan GTİP Oranları ({selectedCountry})
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-slate-600 font-medium">
                        <span className="flex justify-between border-b border-slate-100 pb-0.5">
                          <span>Gümrük Vergisi:</span>
                          <strong className="text-slate-900">{fmt(calculations.customsRate)}%</strong>
                        </span>
                        <span className="flex justify-between border-b border-slate-100 pb-0.5">
                          <span>İlave Gümrük:</span>
                          <strong className="text-slate-900">{fmt(calculations.addRate)}%</strong>
                        </span>
                        <span className="flex justify-between border-b border-slate-100 pb-0.5">
                          <span>KDV Oranı:</span>
                          <strong className="text-slate-900">{fmt(calculations.vatRate)}%</strong>
                        </span>
                        <span className="flex justify-between border-b border-slate-100 pb-0.5">
                          <span>Dumping Vergisi:</span>
                          <strong className="text-slate-900">
                            {calculations.dumpRate > 0 ? `${fmt(calculations.dumpRate)} /kg` : "Uygulanmıyor"}
                          </strong>
                        </span>
                        <span className="flex justify-between col-span-2">
                          <span>Gözetim Kıymeti:</span>
                          <strong className="text-slate-900">
                            {calculations.survValue > 0 ? `${fmt(calculations.survValue)} /kg` : "Uygulanmıyor"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MANUAL INPUT RATES (or when GTIP override is enabled) */}
              {(calculationMode === "manual" || (calculationMode === "gtip" && allowGtipOverride)) && (
                <div className="rounded-xl bg-slate-50/50 p-4 border border-slate-150 space-y-3.5">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                    {calculationMode === "gtip" ? "GTİP Vergi Oranları Üzerine Yaz" : "Manuel İthalat Vergi Oranları"}
                  </p>
                  
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500 font-semibold">Gümrük Vergisi (%)</label>
                      <input
                        value={manualCustomsDuty}
                        onChange={(e) => setManualCustomsDuty(sanitizeNumericInput(e.target.value))}
                        inputMode="decimal"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold"
                        placeholder="Örn: 2,5"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500 font-semibold">İlave GV (%)</label>
                      <input
                        value={manualAdditionalDuty}
                        onChange={(e) => setManualAdditionalDuty(sanitizeNumericInput(e.target.value))}
                        inputMode="decimal"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold"
                        placeholder="Örn: 10"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500 font-semibold">KDV Oranı (%)</label>
                      <input
                        value={manualVatRate}
                        onChange={(e) => setManualVatRate(sanitizeNumericInput(e.target.value))}
                        inputMode="decimal"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold"
                        placeholder="Örn: 20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500 font-semibold">Dumping ($/kg)</label>
                      <input
                        value={manualAntiDumping}
                        onChange={(e) => setManualAntiDumping(sanitizeNumericInput(e.target.value))}
                        inputMode="decimal"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold"
                        placeholder="Örn: 0,5"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                      <label className="text-xs text-slate-500 font-semibold">Gözetim Değeri ($/kg)</label>
                      <input
                        value={manualSurveillance}
                        onChange={(e) => setManualSurveillance(sanitizeNumericInput(e.target.value))}
                        inputMode="decimal"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold"
                        placeholder="Örn: 1,8"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Main Numerical Inputs */}
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-amber-500">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-1">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Temel İthalat & Maliyet Girdileri
            </h3>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Birim Fiyat ($ veya €)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-bold text-xs">
                    $
                  </span>
                  <input
                    value={basePriceText}
                    onChange={(e) => setBasePriceText(sanitizeNumericInput(e.target.value))}
                    inputMode="decimal"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-7 pr-3 text-sm font-bold focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
                    placeholder="Birim ithalat fiyatı"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Birim Ağırlık (kg)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Scale className="h-4 w-4" />
                  </span>
                  <input
                    value={weightText}
                    onChange={(e) => setWeightText(sanitizeNumericInput(e.target.value))}
                    inputMode="decimal"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm font-bold focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
                    placeholder="Örn: 0,850"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Yurtiçi Masraf Oranı (%)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Percent className="h-4 w-4" />
                  </span>
                  <input
                    value={domesticCostText}
                    onChange={(e) => setDomesticCostText(sanitizeNumericInput(e.target.value))}
                    inputMode="decimal"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm font-bold focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
                    placeholder="Gümrük komisyonu, nakliye vb."
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Hedef Kar Marjı (%)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-bold text-xs">
                    %
                  </span>
                  <input
                    value={marginText}
                    onChange={(e) => setMarginText(sanitizeNumericInput(e.target.value))}
                    inputMode="decimal"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-7 pr-3 text-sm font-bold focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
                    placeholder="Maliyet üzerine kar"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE RESULTS & DETAILED BREAKDOWN (5 Columns) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Card 4: High Level Cost Metrics (Gradient Border) */}
          <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-indigo-900 to-indigo-950 p-6 shadow-md text-white border-t-4 border-t-indigo-600 relative overflow-hidden">
            {/* Absolute vector details for premium look */}
            <div className="absolute right-0 top-0 h-28 w-28 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
              Simülasyon Sonuç Özeti
            </p>
            
            <div className="mt-4 space-y-4">
              {/* Recommended Selling Price */}
              <div>
                <p className="text-xs text-indigo-200 font-medium">Önerilen Satış Fiyatı</p>
                <p className="text-3xl font-extrabold text-white mt-1 tracking-tight">
                  {fmt(calculations.sellingPrice)} <span className="text-sm font-bold text-indigo-300">USD</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-indigo-800 pt-3.5">
                <div>
                  <p className="text-[10px] text-indigo-200 uppercase tracking-wider font-semibold">Net Maliyet (KDV hariç)</p>
                  <p className="text-xl font-bold text-emerald-400 mt-0.5">
                    {fmt(calculations.netCost)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-200 uppercase tracking-wider font-semibold">Brüt Maliyet (KDV dahil)</p>
                  <p className="text-xl font-bold text-amber-400 mt-0.5">
                    {fmt(calculations.kdvLiMaliyet)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-indigo-850 pt-3 text-xs text-indigo-200 font-medium">
                <span className="flex items-center gap-1">
                  <Coins className="h-4 w-4 text-emerald-400 shrink-0" />
                  Net Kar Tutarı: <strong>{fmt(calculations.karTutari)} USD</strong>
                </span>
                <span>Kar Oranı: <strong className="text-white">%{fmt(parseInputNumber(marginText))}</strong></span>
              </div>
            </div>
          </div>

          {/* Card 5: Calculation Steps Breakdown */}
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-emerald-600">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3.5">
              Maliyet Hesaplama Aşamaları
            </h3>

            <div className="space-y-3.5 text-xs">
              
              {/* Step 1: Base & Domestic Cost */}
              <div className="flex flex-col gap-1 border-b border-slate-100 pb-2">
                <div className="flex justify-between font-semibold text-slate-700">
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-700 shrink-0">1</span>
                    Ara Tutar (Birim Fiyat + Masraf)
                  </span>
                  <span className="text-slate-900">{fmt(calculations.araTutar)}</span>
                </div>
                <p className="text-[10px] text-slate-400 pl-5">
                  Birim İthalat fiyatına %{fmt(parseInputNumber(domesticCostText))} yurtiçi masraf eklendi.
                </p>
              </div>

              {/* Step 2: Custom Duties */}
              <div className="flex flex-col gap-1 border-b border-slate-100 pb-2">
                <div className="flex justify-between font-semibold text-slate-700">
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-700 shrink-0">2</span>
                    Gümrük & İlave Vergi Toplamı
                  </span>
                  <span className="text-slate-900">
                    {fmt(calculations.customsFromAra + calculations.addFromAra)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 pl-5">
                  Gümrük Vergisi: %{fmt(calculations.customsRate)} ({fmt(calculations.customsFromAra)}) | İlave GV: %{fmt(calculations.addRate)} ({fmt(calculations.addFromAra)})
                </p>
              </div>

              {/* Step 3: Surveillance & Anti-Dumping */}
              {(calculations.hasSurveillance || calculations.hasAntiDumping) && (
                <div className="flex flex-col gap-1 border-b border-slate-100 pb-2">
                  <div className="flex justify-between font-semibold text-slate-700">
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-700 shrink-0">3</span>
                      Gözetim & Dumping Farkı
                    </span>
                    <span className="text-slate-900">
                      {fmt(calculations.dumpingTutar + (calculations.hasSurveillance ? calculations.gozetim : 0))}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 pl-5">
                    {calculations.hasAntiDumping && `Dumping: ${fmt(calculations.dumpingTutar)} `}
                    {calculations.hasSurveillance && `Gözetim: ${fmt(calculations.gozetim)} (Birim: ${fmt(calculations.survValue)})`}
                  </p>
                </div>
              )}

              {/* Step 4: VAT / KDV Matrah & Ödenecek KDV */}
              <div className="flex flex-col gap-1 border-b border-slate-100 pb-2">
                <div className="flex justify-between font-semibold text-slate-700">
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-700 shrink-0">4</span>
                    KDV Matrahı ve Net KDV
                  </span>
                  <span className="text-slate-900">{fmt(calculations.netVatPayable)}</span>
                </div>
                <p className="text-[10px] text-slate-400 pl-5">
                  Matrah: {fmt(calculations.vatBase)} | KDV (%{fmt(calculations.vatRate)}): {fmt(calculations.grossVatPayable)} | İndirilecek KDV: {fmt(calculations.vatCredit)}
                </p>
              </div>

              {/* Step 5: Final sum check */}
              <div className="flex justify-between font-bold text-slate-900 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                <span className="flex items-center gap-1 pl-1">
                  Net İthalat Maliyeti:
                </span>
                <span>{fmt(calculations.netCost)} USD</span>
              </div>
            </div>
          </div>

          {/* Card 6: Country Cost Comparison List (Available in GTIP Mode) */}
          {calculationMode === "gtip" && activeGtip && countryComparison.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-sky-500">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
                <span>Ülkelere Göre Maliyet Kıyaslama</span>
                <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-bold text-sky-700">
                  {calculations.activeGtipCode}
                </span>
              </h3>
              
              <div className="space-y-2 max-h-[260px] overflow-y-auto [scrollbar-width:thin]">
                {countryComparison.map((item) => (
                  <button
                    key={item.country}
                    type="button"
                    onClick={() => setSelectedCountry(item.country)}
                    className={`w-full text-left rounded-lg border p-3 flex items-center justify-between transition cursor-pointer ${
                      item.country === selectedCountry
                        ? "border-sky-500 bg-sky-50/40 text-sky-900"
                        : "border-slate-100 bg-white hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        {item.country}
                        {item.country === selectedCountry && (
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-600" />
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                        Önerilen Satış: <strong className="text-slate-600">{fmt(item.sellingPrice)}</strong>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-slate-900">
                        {fmt(item.netCost)}
                      </p>
                      <p className="text-[9px] text-slate-400 font-medium">Net Maliyet</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
