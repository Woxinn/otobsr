"use client";

import { useMemo, useState } from "react";

type DeclarationLine = {
  id: string;
  code: string;
  name: string;
  gtipCode: string | null;
  quantity: number;
  netKg: number;
  grossKg: number;
  unitPrice: number;
  fobTotal: number;
  freightShare: number;
  insuranceShare: number;
  extraCostShare: number;
  stampTaxShare: number;
  surveillanceUnitValue: number;
  surveillanceApplicable: boolean;
  antiDumpingRate: number;
  antiDumpingApplicable: boolean;
  cif: number;
  surveillanceBase: number;
  customsBase: number;
  customsDutyRate: number;
  customsDuty: number;
  additionalDutyRate: number;
  additionalDuty: number;
  antiDumping: number;
  vatRate: number;
  vatBase: number;
  vat: number;
  totalTaxes: number;
  landedTotal: number;
  landedUnit: number;
  warnings: string[];
};

type Totals = {
  quantity: number;
  netKg: number;
  grossKg: number;
  fobTotal: number;
  freightShare: number;
  insuranceShare: number;
  extraCostShare: number;
  stampTaxShare: number;
  cif: number;
  surveillanceBase: number;
  customsBase: number;
  vatBase: number;
  customsDuty: number;
  additionalDuty: number;
  antiDumping: number;
  vat: number;
  totalTaxes: number;
  landedTotal: number;
};

type Props = {
  lines: DeclarationLine[];
  orderCurrency: string;
  initialRate: number;
  initialFreightTotal: number;
  initialInsuranceTotal: number;
  tcmbDate: string | null;
  tcmbError: string | null;
};

const parseDecimalInput = (value: string) => {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });

const formatTry = (value: number, digits = 2) =>
  `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })} TL`;

export default function OrderDeclarationTryLab({
  lines,
  orderCurrency,
  initialRate,
  initialFreightTotal,
  initialInsuranceTotal,
  tcmbDate,
  tcmbError,
}: Props) {
  const manualCurrencyOptions = Array.from(new Set([orderCurrency, "TRY"].filter(Boolean)));
  const [rateInput, setRateInput] = useState(String(initialRate || 1));
  const [freightInput, setFreightInput] = useState(String(initialFreightTotal || 0));
  const [freightCurrency, setFreightCurrency] = useState(orderCurrency);
  const [insuranceInput, setInsuranceInput] = useState(String(initialInsuranceTotal || 0));
  const [insuranceCurrency, setInsuranceCurrency] = useState(orderCurrency);
  const [stampTaxInput, setStampTaxInput] = useState("0");
  const [stampTaxCurrency, setStampTaxCurrency] = useState<"TRY" | string>("TRY");
  const [warehouseInput, setWarehouseInput] = useState("0");
  const [warehouseCurrency, setWarehouseCurrency] = useState<"TRY" | string>("TRY");
  const [bankInput, setBankInput] = useState("0");
  const [bankCurrency, setBankCurrency] = useState<"TRY" | string>("TRY");
  const [otherInput, setOtherInput] = useState("0");
  const [otherCurrency, setOtherCurrency] = useState<"TRY" | string>("TRY");

  const rate = useMemo(() => {
    const parsed = parseDecimalInput(rateInput);
    return parsed !== null && parsed > 0 ? parsed : 0;
  }, [rateInput]);

  const normalizeManualAmount = (value: string, currency: string) => {
    const parsed = parseDecimalInput(value);
    if (parsed === null || parsed < 0) return 0;
    if (currency === "TRY") {
      return rate > 0 ? parsed / rate : 0;
    }
    return parsed;
  };

  const convertManualAmountToTry = (value: number, currency: string) => {
    if (currency === "TRY") return value;
    return value * rate;
  };

  const freightTotal = useMemo(() => {
    return normalizeManualAmount(freightInput, freightCurrency);
  }, [freightCurrency, freightInput, rate]);

  const insuranceTotal = useMemo(() => {
    return normalizeManualAmount(insuranceInput, insuranceCurrency);
  }, [insuranceCurrency, insuranceInput, rate]);

  const stampTaxTotal = useMemo(() => {
    return normalizeManualAmount(stampTaxInput, stampTaxCurrency);
  }, [rate, stampTaxCurrency, stampTaxInput]);

  const warehouseTotal = useMemo(() => {
    return normalizeManualAmount(warehouseInput, warehouseCurrency);
  }, [rate, warehouseCurrency, warehouseInput]);

  const bankTotal = useMemo(() => {
    return normalizeManualAmount(bankInput, bankCurrency);
  }, [bankCurrency, bankInput, rate]);

  const otherTotal = useMemo(() => {
    return normalizeManualAmount(otherInput, otherCurrency);
  }, [otherCurrency, otherInput, rate]);

  const ancillaryCostsTotal = warehouseTotal + bankTotal + otherTotal;

  const baseTotals = useMemo(
    () =>
      lines.reduce(
        (acc, line) => {
          acc.quantity += line.quantity;
          acc.netKg += line.netKg;
          acc.grossKg += line.grossKg;
          acc.fobTotal += line.fobTotal;
          return acc;
        },
        {
          quantity: 0,
          netKg: 0,
          grossKg: 0,
          fobTotal: 0,
          freightShare: 0,
          insuranceShare: 0,
          extraCostShare: 0,
          stampTaxShare: 0,
          cif: 0,
          surveillanceBase: 0,
          customsBase: 0,
          vatBase: 0,
          customsDuty: 0,
          additionalDuty: 0,
          antiDumping: 0,
          vat: 0,
          totalTaxes: 0,
          landedTotal: 0,
        } as Totals
      ),
    [lines]
  );

  const computed = useMemo(() => {
    const freightBase = baseTotals.netKg > 0 ? baseTotals.netKg : baseTotals.fobTotal;
    const preLines = lines.map((line) => {
      const freightShare =
        freightTotal > 0 && freightBase > 0
          ? freightTotal *
            (baseTotals.netKg > 0
              ? line.netKg / baseTotals.netKg
              : line.fobTotal / Math.max(baseTotals.fobTotal, 1))
          : 0;

      const insuranceShare =
        insuranceTotal > 0 && baseTotals.fobTotal > 0
          ? insuranceTotal * (line.fobTotal / baseTotals.fobTotal)
          : 0;

      const cif = line.fobTotal + freightShare + insuranceShare;
      let surveillanceWeightKg = line.grossKg;
      if (surveillanceWeightKg <= 0 && baseTotals.grossKg > 0) {
        surveillanceWeightKg =
          baseTotals.fobTotal > 0
            ? (line.fobTotal / Math.max(baseTotals.fobTotal, 1)) * baseTotals.grossKg
            : 0;
      }
      const surveillanceBase =
        line.surveillanceApplicable && surveillanceWeightKg > 0
          ? line.surveillanceUnitValue * surveillanceWeightKg
          : 0;
      const customsBase = Math.max(cif, surveillanceBase);
      const customsDuty = customsBase * (line.customsDutyRate / 100);
      const additionalDuty = customsBase * (line.additionalDutyRate / 100);
      const antiDumping =
        line.antiDumpingApplicable && line.netKg > 0 ? line.antiDumpingRate * line.netKg : 0;

      return {
        ...line,
        freightShare,
        insuranceShare,
        cif,
        surveillanceBase,
        customsBase,
        customsDuty,
        additionalDuty,
        antiDumping,
      };
    });

    const customsBaseTotal = preLines.reduce((sum, line) => sum + line.customsBase, 0);
    const extraCostBase = customsBaseTotal > 0 ? customsBaseTotal : baseTotals.fobTotal;
    const stampTaxBase = baseTotals.fobTotal;

    const nextLines = preLines.map((line) => {
      const extraCostShare =
        ancillaryCostsTotal > 0 && extraCostBase > 0 ? ancillaryCostsTotal * (line.customsBase / extraCostBase) : 0;
      const stampTaxShare =
        stampTaxTotal > 0 && stampTaxBase > 0 ? stampTaxTotal * (line.fobTotal / stampTaxBase) : 0;

      const vatBase = line.customsBase + line.customsDuty + line.additionalDuty + line.antiDumping + extraCostShare + stampTaxShare;
      const vat = vatBase * (line.vatRate / 100);
      const totalTaxes = line.customsDuty + line.additionalDuty + line.antiDumping + vat + stampTaxShare;
      const landedTotal = line.cif + extraCostShare + totalTaxes;
      const landedUnit = line.quantity > 0 ? landedTotal / line.quantity : 0;

      return {
        ...line,
        extraCostShare,
        stampTaxShare,
        vatBase,
        vat,
        totalTaxes,
        landedTotal,
        landedUnit,
        unitPriceTry: line.unitPrice * rate,
        fobTotalTry: line.fobTotal * rate,
        freightShareTry: line.freightShare * rate,
        insuranceShareTry: line.insuranceShare * rate,
        extraCostShareTry: extraCostShare * rate,
        stampTaxShareTry: stampTaxShare * rate,
        cifTry: line.cif * rate,
        surveillanceBaseTry: line.surveillanceBase * rate,
        customsBaseTry: line.customsBase * rate,
        customsDutyTry: line.customsDuty * rate,
        additionalDutyTry: line.additionalDuty * rate,
        antiDumpingTry: line.antiDumping * rate,
        vatBaseTry: vatBase * rate,
        vatTry: vat * rate,
        totalTaxesTry: totalTaxes * rate,
        landedTotalTry: landedTotal * rate,
        landedUnitTry: landedUnit * rate,
      };
    });

    const totals = nextLines.reduce(
      (acc, line) => {
        acc.quantity += line.quantity;
        acc.netKg += line.netKg;
        acc.grossKg += line.grossKg;
        acc.fobTotal += line.fobTotal;
        acc.freightShare += line.freightShare;
        acc.insuranceShare += line.insuranceShare;
        acc.extraCostShare += line.extraCostShare;
        acc.stampTaxShare += line.stampTaxShare;
        acc.cif += line.cif;
        acc.surveillanceBase += line.surveillanceBase;
        acc.customsBase += line.customsBase;
        acc.vatBase += line.vatBase;
        acc.customsDuty += line.customsDuty;
        acc.additionalDuty += line.additionalDuty;
        acc.antiDumping += line.antiDumping;
        acc.vat += line.vat;
        acc.totalTaxes += line.totalTaxes;
        acc.landedTotal += line.landedTotal;
        return acc;
      },
      {
        quantity: 0,
        netKg: 0,
        grossKg: 0,
        fobTotal: 0,
        freightShare: 0,
        insuranceShare: 0,
        extraCostShare: 0,
        stampTaxShare: 0,
        cif: 0,
        surveillanceBase: 0,
        customsBase: 0,
        vatBase: 0,
        customsDuty: 0,
        additionalDuty: 0,
        antiDumping: 0,
        vat: 0,
        totalTaxes: 0,
        landedTotal: 0,
      } as Totals
    );

    return { lines: nextLines, totals };
  }, [ancillaryCostsTotal, baseTotals.fobTotal, baseTotals.grossKg, baseTotals.netKg, freightTotal, insuranceTotal, lines, rate, stampTaxTotal]);

  const totalsTry = useMemo(
    () => ({
      fobTotal: computed.totals.fobTotal * rate,
      freightShare: computed.totals.freightShare * rate,
      insuranceShare: computed.totals.insuranceShare * rate,
      extraCostShare: computed.totals.extraCostShare * rate,
      stampTaxShare: computed.totals.stampTaxShare * rate,
      cif: computed.totals.cif * rate,
      surveillanceBase: computed.totals.surveillanceBase * rate,
      customsBase: computed.totals.customsBase * rate,
      vatBase: computed.totals.vatBase * rate,
      customsDuty: computed.totals.customsDuty * rate,
      additionalDuty: computed.totals.additionalDuty * rate,
      antiDumping: computed.totals.antiDumping * rate,
      vat: computed.totals.vat * rate,
      totalTaxes: computed.totals.totalTaxes * rate,
      landedTotal: computed.totals.landedTotal * rate,
      landedUnit:
        computed.totals.quantity > 0 ? (computed.totals.landedTotal / computed.totals.quantity) * rate : 0,
    }),
    [computed.totals, rate]
  );

  const gtipRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        id: string;
        gtipCode: string;
        lineCount: number;
        quantity: number;
        netKg: number;
        grossKg: number;
        fobTotalTry: number;
        freightShareTry: number;
        insuranceShareTry: number;
        cifTry: number;
        customsBaseTry: number;
        extraCostShareTry: number;
        stampTaxShareTry: number;
        vatBaseTry: number;
        surveillanceBaseTry: number;
        customsDutyTry: number;
        additionalDutyTry: number;
        antiDumpingTry: number;
        vatTry: number;
        totalTaxesTry: number;
        landedTotalTry: number;
        customsDutyRates: Set<string>;
        additionalDutyRates: Set<string>;
        vatRates: Set<string>;
        warnings: Set<string>;
      }
    >();

    for (const line of computed.lines) {
      const gtipCode = line.gtipCode ?? "GTIP yok";
      const key = gtipCode;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          gtipCode,
          lineCount: 0,
          quantity: 0,
          netKg: 0,
          grossKg: 0,
          fobTotalTry: 0,
          freightShareTry: 0,
          insuranceShareTry: 0,
          cifTry: 0,
          customsBaseTry: 0,
          extraCostShareTry: 0,
          stampTaxShareTry: 0,
          vatBaseTry: 0,
          surveillanceBaseTry: 0,
          customsDutyTry: 0,
          additionalDutyTry: 0,
          antiDumpingTry: 0,
          vatTry: 0,
          totalTaxesTry: 0,
          landedTotalTry: 0,
          customsDutyRates: new Set<string>(),
          additionalDutyRates: new Set<string>(),
          vatRates: new Set<string>(),
          warnings: new Set<string>(),
        });
      }
      const row = grouped.get(key)!;
      row.lineCount += 1;
      row.quantity += line.quantity;
      row.netKg += line.netKg;
      row.grossKg += line.grossKg;
      row.fobTotalTry += line.fobTotalTry;
      row.freightShareTry += line.freightShareTry;
      row.insuranceShareTry += line.insuranceShareTry;
      row.cifTry += line.cifTry;
      row.customsBaseTry += line.customsBaseTry;
      row.extraCostShareTry += line.extraCostShareTry;
      row.stampTaxShareTry += line.stampTaxShareTry;
      row.vatBaseTry += line.vatBaseTry;
      row.surveillanceBaseTry += line.surveillanceBaseTry;
      row.customsDutyTry += line.customsDutyTry;
      row.additionalDutyTry += line.additionalDutyTry;
      row.antiDumpingTry += line.antiDumpingTry;
      row.vatTry += line.vatTry;
      row.totalTaxesTry += line.totalTaxesTry;
      row.landedTotalTry += line.landedTotalTry;
      row.customsDutyRates.add(formatNumber(line.customsDutyRate, 2));
      row.additionalDutyRates.add(formatNumber(line.additionalDutyRate, 2));
      row.vatRates.add(formatNumber(line.vatRate, 2));
      line.warnings.forEach((warning) => row.warnings.add(warning));
    }

    return Array.from(grouped.values()).sort((a, b) => a.gtipCode.localeCompare(b.gtipCode, "tr"));
  }, [computed.lines]);

  const gtipTotalsTry = useMemo(
    () =>
      gtipRows.reduce(
        (acc, row) => {
          acc.lineCount += row.lineCount;
          acc.quantity += row.quantity;
          acc.netKg += row.netKg;
          acc.grossKg += row.grossKg;
          acc.fobTotalTry += row.fobTotalTry;
          acc.freightShareTry += row.freightShareTry;
          acc.insuranceShareTry += row.insuranceShareTry;
          acc.cifTry += row.cifTry;
          acc.customsBaseTry += row.customsBaseTry;
          acc.extraCostShareTry += row.extraCostShareTry;
          acc.stampTaxShareTry += row.stampTaxShareTry;
          acc.vatBaseTry += row.vatBaseTry;
          acc.customsDutyTry += row.customsDutyTry;
          acc.additionalDutyTry += row.additionalDutyTry;
          acc.antiDumpingTry += row.antiDumpingTry;
          acc.vatTry += row.vatTry;
          acc.totalTaxesTry += row.totalTaxesTry;
          acc.landedTotalTry += row.landedTotalTry;
          return acc;
        },
        {
          lineCount: 0,
          quantity: 0,
          netKg: 0,
          grossKg: 0,
          fobTotalTry: 0,
          freightShareTry: 0,
          insuranceShareTry: 0,
          cifTry: 0,
          customsBaseTry: 0,
          extraCostShareTry: 0,
          stampTaxShareTry: 0,
          vatBaseTry: 0,
          customsDutyTry: 0,
          additionalDutyTry: 0,
          antiDumpingTry: 0,
          vatTry: 0,
          totalTaxesTry: 0,
          landedTotalTry: 0,
        }
      ),
    [gtipRows]
  );

  const summaryCards = [
    {
      label: "FOB toplam",
      value: formatTry(totalsTry.fobTotal),
      hint: `${formatNumber(computed.totals.quantity, 0)} adet`,
    },
    {
      label: "Navlun",
      value: formatTry(totalsTry.freightShare),
      hint: "Anlik dagitim",
    },
    {
      label: "Sigorta",
      value: formatTry(totalsTry.insuranceShare),
      hint: "Anlık dağıtım",
    },
    {
      label: "Ek giderler",
      value: formatTry(totalsTry.extraCostShare),
      hint: "Depo + banka + diğer",
    },
    {
      label: "KDV matrahı",
      value: formatTry(totalsTry.vatBase),
      hint: "Damga ve ek giderler dahil",
    },
    {
      label: "CIF / matrah",
      value: formatTry(totalsTry.customsBase),
      hint: "Gözetim varsa max(CIF, gözetim)",
    },
    {
      label: "Toplam vergi",
      value: formatTry(totalsTry.totalTaxes),
      hint: "GV + ilave vergi + anti-damping + KDV",
    },
    {
      label: "Vergili maliyet",
      value: formatTry(totalsTry.landedTotal),
      hint: `${formatTry(totalsTry.landedUnit, 6)} birim maliyet`,
    },
  ];

  const taxBreakdownCards = [
    {
      label: "Toplam gözetim değeri",
      value: formatTry(totalsTry.surveillanceBase),
      hint: "Kalem bazlı gözetim tabanları",
    },
    {
      label: "Toplam damga vergisi",
      value: formatTry(totalsTry.stampTaxShare),
      hint: "Ödenecek vergi toplamına dahil",
    },
    {
      label: "Toplam gümrük vergisi",
      value: formatTry(totalsTry.customsDuty),
      hint: "GV toplamı",
    },
    {
      label: "Toplam ilave gümrük vergisi",
      value: formatTry(totalsTry.additionalDuty),
      hint: "İGV toplamı",
    },
    {
      label: "Toplam damping",
      value: formatTry(totalsTry.antiDumping),
      hint: "Anti-damping toplamı",
    },
    {
      label: "Toplam KDV",
      value: formatTry(totalsTry.vat),
      hint: "Ek giderler dahil KDV",
    },
  ];

  return (
    <>
      <div className="space-y-2">
        <div className="rounded-lg border border-amber-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-800/70">Masraf ve kur paneli</p>
              <p className="mt-1 text-xs text-black/50">Giderleri gir, TL maliyet dağılımı anında yenilensin.</p>
            </div>
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-950">
              {orderCurrency} / TRY: {formatNumber(rate, 4)}
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <label className="block rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
              <span className="text-xs font-semibold text-amber-900/70">Navlun ({orderCurrency})</span>
              <div className="mt-2 flex gap-2">
                <input value={freightInput} onChange={(e) => setFreightInput(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-black outline-none" />
                <select value={freightCurrency} onChange={(e) => setFreightCurrency(e.target.value)} className="rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm font-semibold text-black outline-none">
                  {manualCurrencyOptions.map((option) => (
                    <option key={`freight-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="block rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
              <span className="text-xs font-semibold text-amber-900/70">Sigorta ({orderCurrency})</span>
              <div className="mt-2 flex gap-2">
                <input value={insuranceInput} onChange={(e) => setInsuranceInput(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-black outline-none" />
                <select value={insuranceCurrency} onChange={(e) => setInsuranceCurrency(e.target.value)} className="rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm font-semibold text-black outline-none">
                  {manualCurrencyOptions.map((option) => (
                    <option key={`insurance-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="block rounded-lg border border-black/10 bg-[#fbfaf6] px-3 py-2">
              <span className="text-xs font-semibold text-black/55">Damga</span>
              <div className="mt-2 flex gap-2">
                <input value={stampTaxInput} onChange={(e) => setStampTaxInput(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-semibold text-black outline-none" />
                <select value={stampTaxCurrency} onChange={(e) => setStampTaxCurrency(e.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm font-semibold text-black outline-none">
                  {manualCurrencyOptions.map((option) => (
                    <option key={`stamp-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="block rounded-lg border border-black/10 bg-[#fbfaf6] px-3 py-2">
              <span className="text-xs font-semibold text-black/55">Depo</span>
              <div className="mt-2 flex gap-2">
                <input value={warehouseInput} onChange={(e) => setWarehouseInput(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-semibold text-black outline-none" />
                <select value={warehouseCurrency} onChange={(e) => setWarehouseCurrency(e.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm font-semibold text-black outline-none">
                  {manualCurrencyOptions.map((option) => (
                    <option key={`warehouse-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="block rounded-lg border border-black/10 bg-[#fbfaf6] px-3 py-2">
              <span className="text-xs font-semibold text-black/55">Banka</span>
              <div className="mt-2 flex gap-2">
                <input value={bankInput} onChange={(e) => setBankInput(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-semibold text-black outline-none" />
                <select value={bankCurrency} onChange={(e) => setBankCurrency(e.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm font-semibold text-black outline-none">
                  {manualCurrencyOptions.map((option) => (
                    <option key={`bank-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="block rounded-lg border border-black/10 bg-[#fbfaf6] px-3 py-2">
              <span className="text-xs font-semibold text-black/55">Diger + Kur</span>
              <div className="mt-2 flex gap-2">
                <input value={otherInput} onChange={(e) => setOtherInput(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-semibold text-black outline-none" />
                <select value={otherCurrency} onChange={(e) => setOtherCurrency(e.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm font-semibold text-black outline-none">
                  {manualCurrencyOptions.map((option) => (
                    <option key={`other-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <input value={rateInput} onChange={(e) => setRateInput(e.target.value)} inputMode="decimal" className="mt-2 w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-semibold text-black outline-none" />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-black/50">
            Siparis para birimi: {orderCurrency} / TRY | TCMB: {formatNumber(initialRate, 4)} | Tarih: {tcmbDate ?? "-"}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 shadow-[0_12px_30px_-24px_rgba(0,0,0,0.3)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-900/65">{card.label}</p>
              <p className="mt-2 text-lg font-semibold leading-tight text-black">{card.value}</p>
              <p className="mt-1 text-[11px] text-black/55">{card.hint}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {taxBreakdownCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-black/10 bg-white/95 p-3 shadow-[0_12px_30px_-24px_rgba(0,0,0,0.25)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/40">{card.label}</p>
              <p className="mt-2 text-base font-semibold text-black">{card.value}</p>
              <p className="mt-1 text-[11px] text-black/55">{card.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <div className="border-b border-black/8 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/40">GTIP bazlı hesap</p>
          <h2 className="mt-1 text-base font-semibold text-black">Beyanname GTIP toplamları (TL)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1840px] table-fixed text-xs">
            <thead className="bg-[#fbfaf6] text-left text-[10px] uppercase tracking-[0.16em] text-black/45">
              <tr>
                <th className="sticky left-0 z-20 w-[240px] border-b border-r border-black/8 bg-[#fbfaf6] px-3 py-2">GTIP</th>
                <th className="w-[90px] border-b border-r border-black/8 px-3 py-2 text-right">Kalem</th>
                <th className="w-[90px] border-b border-r border-black/8 px-3 py-3 text-right">Adet</th>
                <th className="w-[110px] border-b border-r border-black/8 px-3 py-3 text-right">Net kg</th>
                <th className="w-[110px] border-b border-r border-black/8 px-3 py-3 text-right">Brut kg</th>
                <th className="w-[140px] border-b border-r border-black/8 px-3 py-3 text-right">Birim fiyat</th>
                <th className="w-[140px] border-b border-r border-black/8 px-3 py-3 text-right">FOB</th>
                <th className="w-[140px] border-b border-r border-black/8 px-3 py-3 text-right">Navlun</th>
                <th className="w-[140px] border-b border-r border-black/8 px-3 py-3 text-right">Sigorta</th>
                <th className="w-[170px] border-b border-r border-black/8 px-3 py-3 text-right">CIF / Gumruk matrahi</th>
                <th className="w-[150px] border-b border-r border-black/8 px-3 py-3 text-right">Ek gider</th>
                <th className="w-[150px] border-b border-r border-black/8 px-3 py-3 text-right">Damga</th>
                <th className="w-[160px] border-b border-r border-black/8 px-3 py-3 text-right">KDV matrahı</th>
                <th className="w-[150px] border-b border-r border-black/8 px-3 py-3 text-right">GV</th>
                <th className="w-[150px] border-b border-r border-black/8 px-3 py-3 text-right">Ilave vergi</th>
                <th className="w-[150px] border-b border-r border-black/8 px-3 py-3 text-right">Anti-damping</th>
                <th className="w-[150px] border-b border-r border-black/8 px-3 py-3 text-right">KDV</th>
                <th className="w-[160px] border-b border-r border-black/8 px-3 py-3 text-right">Toplam vergi</th>
                <th className="w-[170px] border-b border-r border-black/8 px-3 py-3 text-right">Vergili toplam</th>
                <th className="w-[170px] border-b border-black/8 px-3 py-3 text-right">Birim maliyet</th>
              </tr>
            </thead>
            <tbody>
              {gtipRows.map((line, index) => (
                <tr key={line.id} className={index % 2 === 0 ? "bg-white" : "bg-black/[0.015]"}>
                  <td className="sticky left-0 z-10 border-b border-r border-black/8 bg-inherit px-4 py-2.5 align-top">
                    <div className="space-y-1">
                      <p className="font-semibold text-black">{line.gtipCode}</p>
                      <p className="text-black/65">Toplam {formatNumber(line.lineCount, 0)} kalem</p>
                      {line.warnings.size ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Array.from(line.warnings).slice(0, 4).map((warning) => (
                            <span
                              key={`${line.id}-${warning}`}
                              className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900"
                            >
                              {warning}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">{formatNumber(line.lineCount, 0)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">{formatNumber(line.quantity, 0)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">{formatNumber(line.netKg, 3)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">{formatNumber(line.grossKg, 3)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">
                    {formatTry(line.quantity > 0 ? line.fobTotalTry / line.quantity : 0, 6)}
                  </td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">{formatTry(line.fobTotalTry)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">{formatTry(line.freightShareTry)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">{formatTry(line.insuranceShareTry)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">
                    <div>
                      <p>{formatTry(line.customsBaseTry)}</p>
                      <p className="mt-1 text-[11px] text-black/45">CIF: {formatTry(line.cifTry)}</p>
                      <p className="mt-1 text-[11px] text-black/45">Gozetim: {formatTry(line.surveillanceBaseTry)}</p>
                      <p className="mt-1 text-[11px] text-black/45">Kural: max(CIF, Gozetim)</p>
                    </div>
                  </td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">{formatTry(line.extraCostShareTry)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">{formatTry(line.stampTaxShareTry)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">
                    <div>
                      {formatTry(line.vatBaseTry)}
                      <p className="mt-1 text-[11px] text-black/45">Gumruk matrahi: {formatTry(line.customsBaseTry)}</p>
                      <p className="mt-1 text-[11px] text-black/45">+ GV: {formatTry(line.customsDutyTry)}</p>
                      <p className="mt-1 text-[11px] text-black/45">+ Ilave vergi: {formatTry(line.additionalDutyTry)}</p>
                      <p className="mt-1 text-[11px] text-black/45">+ Anti-damping: {formatTry(line.antiDumpingTry)}</p>
                      <p className="mt-1 text-[11px] text-black/45">+ Ek gider: {formatTry(line.extraCostShareTry)}</p>
                      <p className="mt-1 text-[11px] text-black/45">+ Damga: {formatTry(line.stampTaxShareTry)}</p>
                      {line.surveillanceBaseTry > 0 ? (
                        <p className="mt-1 text-[11px] text-black/45">Gozetim tabani: {formatTry(line.surveillanceBaseTry)}</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">
                    <div>
                      {formatTry(line.customsDutyTry)}
                      <p className="mt-1 text-[11px] text-black/45">
                        %{line.customsDutyRates.size === 1 ? Array.from(line.customsDutyRates)[0] : "karma"}
                      </p>
                    </div>
                  </td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">
                    <div>
                      {formatTry(line.additionalDutyTry)}
                      <p className="mt-1 text-[11px] text-black/45">
                        %{line.additionalDutyRates.size === 1 ? Array.from(line.additionalDutyRates)[0] : "karma"}
                      </p>
                    </div>
                  </td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">{formatTry(line.antiDumpingTry)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right">
                    <div>
                      {formatTry(line.vatTry)}
                      <p className="mt-1 text-[11px] text-black/45">
                        %{line.vatRates.size === 1 ? Array.from(line.vatRates)[0] : "karma"} | Matrah {formatTry(line.vatBaseTry)}
                      </p>
                    </div>
                  </td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right font-medium">{formatTry(line.totalTaxesTry)}</td>
                  <td className="border-b border-r border-black/8 px-3 py-2.5 text-right font-semibold text-black">{formatTry(line.landedTotalTry)}</td>
                  <td className="border-b border-black/8 px-3 py-2.5 text-right font-semibold text-black">
                    {formatTry(line.quantity > 0 ? line.landedTotalTry / line.quantity : 0, 6)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[var(--paper)]/85">
              <tr className="font-semibold text-black">
                <td className="sticky left-0 z-10 border-r border-t border-black/8 bg-[var(--paper)]/95 px-4 py-2.5">Toplam</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-black/50">-</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatNumber(gtipTotalsTry.quantity, 0)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatNumber(gtipTotalsTry.netKg, 3)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatNumber(gtipTotalsTry.grossKg, 3)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">-</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.fobTotalTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.freightShareTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.insuranceShareTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.customsBaseTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.extraCostShareTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.stampTaxShareTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.vatBaseTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.customsDutyTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.additionalDutyTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.antiDumpingTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.vatTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.totalTaxesTry)}</td>
                <td className="border-r border-t border-black/8 px-3 py-2.5 text-right">{formatTry(gtipTotalsTry.landedTotalTry)}</td>
                <td className="border-t border-black/8 px-3 py-2.5 text-right">
                  {formatTry(gtipTotalsTry.quantity > 0 ? gtipTotalsTry.landedTotalTry / gtipTotalsTry.quantity : 0, 6)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

