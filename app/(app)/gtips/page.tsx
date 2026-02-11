import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GtipListPage() {
  const supabase = await createSupabaseServerClient();

  const { data: gtips } = await supabase
    .from("gtips")
    .select("id, code, description, customs_duty_rate, additional_duty_rate, vat_rate, products(count)")
    .order("code");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">GTIP listesi</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">GTIP yönetimi</h1>
          <p className="text-sm text-black/60">Kodlar, oranlar ve ürün bağlantıları</p>
        </div>
        <Link
          href="/gtips/new"
          className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
        >
          + Yeni GTIP
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[var(--sand)] text-left text-xs uppercase tracking-[0.15em] text-black/60">
            <tr>
              <th className="px-4 py-3">Kod</th>
              <th className="px-4 py-3">Açıklama</th>
              <th className="px-4 py-3 text-right">GV %</th>
              <th className="px-4 py-3 text-right">İlave GV %</th>
              <th className="px-4 py-3 text-right">KDV %</th>
              <th className="px-4 py-3 text-right">Ürün adedi</th>
              <th className="px-4 py-3 text-right">Detay</th>
            </tr>
          </thead>
          <tbody>
            {gtips?.length ? (
              gtips.map((g) => {
                const productCount = Array.isArray(g.products)
                  ? g.products[0]?.count
                  : (g.products as { count?: number } | null | undefined)?.count;
                return (
                  <tr key={g.id} className="border-t border-black/5 hover:bg-[rgba(15,61,62,0.03)]">
                    <td className="px-4 py-3 font-semibold text-black">{g.code}</td>
                    <td className="px-4 py-3 text-black/70">{g.description ?? "-"}</td>
                    <td className="px-4 py-3 text-right">{g.customs_duty_rate ?? 0}</td>
                    <td className="px-4 py-3 text-right">{g.additional_duty_rate ?? 0}</td>
                    <td className="px-4 py-3 text-right">{g.vat_rate ?? 0}</td>
                    <td className="px-4 py-3 text-right">{productCount ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/gtips/${g.id}`}
                        className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold text-black/70"
                      >
                        Gör
                      </Link>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="px-4 py-4 text-sm text-black/60" colSpan={7}>
                  Henüz GTIP eklenmemiş.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
