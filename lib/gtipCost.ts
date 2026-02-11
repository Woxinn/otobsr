// FEATURE: product-cost/gtip
// Maliyet hesaplama yardimcisi
export type GtipRow = {
  id: string;
  code: string;
  description?: string | null;
  customs_duty_rate?: number | null; // %
  additional_duty_rate?: number | null; // %
  anti_dumping_applicable?: boolean | null;
  anti_dumping_rate?: number | null; // tutar/kg
  surveillance_applicable?: boolean | null;
  surveillance_unit_value?: number | null; // tutar/kg
};

export type CostInputs = {
  basePrice: number | null; // son siparis birim fiyati
  domesticCostPercent: number | null; // %
  weightKg: number | null;
  gtip: GtipRow | null;
};

export type CostResult = {
  araTutar: number | null;
  dumpingTutar: number | null;
  gozetim: number | null;
  gozetimliMatrah: number | null;
  gozetimsizMatrah: number | null;
  customsFromGozetim: number | null;
  addFromGozetim: number | null;
  customsFromAra: number | null;
  addFromAra: number | null;
};

const pct = (value: number | null | undefined) => (value ?? 0) / 100;

export function computeCosts(input: CostInputs): CostResult {
  const base = input.basePrice ?? null;
  const domesticPct = pct(input.domesticCostPercent);
  const weight = input.weightKg ?? null;
  const g = input.gtip;

  const araTutar = base !== null ? base * (1 + domesticPct) : null;

  const dumpingTutar = g?.anti_dumping_applicable && weight !== null
    ? (Number(g.anti_dumping_rate ?? 0) || 0) * weight
    : null;

  const gozetim = g?.surveillance_applicable && weight !== null
    ? (Number(g.surveillance_unit_value ?? 0) || 0) * weight
    : null;

  const customsPct = pct(g?.customs_duty_rate ?? 0);
  const addPct = pct(g?.additional_duty_rate ?? 0);

  const customsFromGozetim = gozetim !== null ? gozetim * customsPct : null;
  const addFromGozetim = gozetim !== null ? gozetim * addPct : null;

  const gozetimliMatrah = gozetim !== null
    ? gozetim + (customsFromGozetim ?? 0) + (addFromGozetim ?? 0) + (dumpingTutar ?? 0)
    : null;

  const customsFromAra = araTutar !== null ? araTutar * customsPct : null;
  const addFromAra = araTutar !== null ? araTutar * addPct : null;

  const gozetimsizMatrah = araTutar !== null
    ? araTutar + (customsFromAra ?? 0) + (addFromAra ?? 0) + (dumpingTutar ?? 0)
    : null;

  return {
    araTutar,
    dumpingTutar,
    gozetim,
    gozetimliMatrah,
    gozetimsizMatrah,
    customsFromGozetim,
    addFromGozetim,
    customsFromAra,
    addFromAra,
  };
}

export function pickWeightKg(attributes: any[] | null | undefined): number | null {
  if (!attributes?.length) return null;
  const weightAttr = attributes.find((attr) => {
    const name = (
      attr?.name ??
      attr?.attribute_name ??
      ""
    ).toString().toLowerCase();
    return name.includes("weight") || name.includes("agirlik") || name.includes("agırlık") || name.includes("ağırlık");
  });
  if (!weightAttr) return null;
  const raw =
    weightAttr.rawValue ??
    weightAttr.value ??
    weightAttr.raw_value ??
    weightAttr.number_value ??
    weightAttr.value_number ??
    weightAttr.value_text ??
    weightAttr.text_value;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}
// END FEATURE: product-cost/gtip
