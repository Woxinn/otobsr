import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";
import ImportCostCalculatorClient from "@/components/ImportCostCalculatorClient";
import type { GtipRow } from "@/lib/gtipCost";

export default async function ImportCostCalculatorPage() {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();

  if (role === "Satis") {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">
        Bu modüle erişim yetkiniz bulunmamaktadır. Maliyet hesaplama modülü yalnızca Yönetim ve Yönetici rolleri tarafından görüntülenebilir.
      </div>
    );
  }

  // Fetch all GTIPs
  const { data: gtips } = await supabase
    .from("gtips")
    .select("*")
    .order("code");

  // Fetch unique list of countries having customized rates
  const { data: countryRows } = await supabase
    .from("gtip_country_rates")
    .select("country")
    .order("country");

  const uniqueCountries = Array.from(
    new Set((countryRows ?? []).map((r) => r.country).filter(Boolean))
  );

  const fallbackCountries = ["Çin", "Almanya", "İtalya", "Hindistan", "Polonya", "Tayvan"];
  const availableCountries = uniqueCountries.length ? uniqueCountries : fallbackCountries;

  return (
    <ImportCostCalculatorClient
      gtips={(gtips ?? []) as unknown as GtipRow[]}
      availableCountries={availableCountries}
    />
  );
}
