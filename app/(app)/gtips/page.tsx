import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import GtipListClient from "@/components/GtipListClient";

export default async function GtipListPage() {
  const supabase = await createSupabaseServerClient();

  const { data: gtips } = await supabase
    .from("gtips")
    .select(
      "id, code, description, customs_duty_rate, additional_duty_rate, vat_rate, anti_dumping_applicable, anti_dumping_rate, surveillance_applicable, surveillance_unit_value, products(count)"
    )
    .order("code");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">GTİP listesi</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">GTİP yönetimi</h1>
          <p className="text-sm text-black/60">Kodlar, oranlar ve ürün bağlantıları</p>
        </div>
        <Link
          href="/gtips/new"
          className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
        >
          + Yeni GTIP
        </Link>
      </div>

      <GtipListClient gtips={(gtips as any[]) ?? []} />
    </section>
  );
}

