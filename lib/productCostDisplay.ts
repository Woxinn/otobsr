import { computeCosts, type GtipRow } from "@/lib/gtipCost";

export type CountryRateRow = {
  country: string;
  customs_duty_rate?: number | null;
  additional_duty_rate?: number | null;
  anti_dumping_applicable?: boolean | null;
  anti_dumping_rate?: number | null;
  surveillance_applicable?: boolean | null;
  surveillance_unit_value?: number | null;
  vat_rate?: number | null;
};

export function resolveGtipForCountry(
  gtipBase: GtipRow | null,
  countryRates: CountryRateRow[] | null | undefined,
  selectedCountry: string | null | undefined
): GtipRow | null {
  if (!gtipBase) return null;
  const normalizedCountry = String(selectedCountry ?? "").trim().toLowerCase();
  if (!normalizedCountry || !countryRates?.length) return gtipBase;

  const countryGtip =
    countryRates.find((row) => String(row.country ?? "").trim().toLowerCase() === normalizedCountry) ?? null;

  if (!countryGtip) return gtipBase;

  return {
    ...gtipBase,
    customs_duty_rate: countryGtip.customs_duty_rate,
    additional_duty_rate: countryGtip.additional_duty_rate,
    anti_dumping_applicable: countryGtip.anti_dumping_applicable,
    anti_dumping_rate: countryGtip.anti_dumping_rate,
    surveillance_applicable: countryGtip.surveillance_applicable,
    surveillance_unit_value: countryGtip.surveillance_unit_value,
    vat_rate: countryGtip.vat_rate,
  };
}

export function calculateDisplayedNetCost(input: {
  basePrice: number | null;
  domesticCostPercent: number | null;
  weightKg: number | null;
  gtipBase: GtipRow | null;
  countryRates?: CountryRateRow[] | null;
  selectedCountry?: string | null;
}) {
  const gtipToUse = resolveGtipForCountry(input.gtipBase, input.countryRates, input.selectedCountry);
  const costs = computeCosts({
    basePrice: input.basePrice,
    domesticCostPercent: input.domesticCostPercent ?? 0,
    weightKg: input.weightKg,
    gtip: gtipToUse,
  });

  const customsFromGozetim = costs.customsFromGozetim;
  const addFromGozetim = costs.addFromGozetim;
  const customsFromAra = costs.customsFromAra;

  const vatBaseCandidates = [costs.gozetimliMatrah, costs.gozetimsizMatrah].filter(
    (v): v is number => v !== null
  );
  const vatBase = vatBaseCandidates.length ? Math.max(...vatBaseCandidates) : null;
  const vatRate = 0.2;
  const grossVatPayable = vatBase !== null ? vatBase * vatRate : null;

  const vatCreditBase = costs.araTutar !== null ? (costs.araTutar ?? 0) + (customsFromAra ?? 0) : null;
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

  const netCost =
    kdvBaz !== null
      ? shouldAddNetVat
        ? netVatPayable !== null
          ? kdvBaz + netVatPayable
          : null
        : kdvBaz
      : null;

  return {
    netCost,
    hasGtip: Boolean(gtipToUse),
    gtipToUse,
    costs,
  };
}
