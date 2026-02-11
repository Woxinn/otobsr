// FEATURE: packing-list/import
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PackingListsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("packing_lists")
    .select("id, file_name, status, version, created_at, orders(id, name)")
    .order("created_at", { ascending: false });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">Packing list</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">Packing listler</h1>
          <p className="text-sm text-black/60">
            Tedarikçiden gelen packing list dosyalarını saklayın, ürünlerle eşleştirin, gümrük için raporlayın.
          </p>
        </div>
        <Link
          href="/packing-lists/new"
          className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
        >
          Yeni import
        </Link>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        {data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.25em] text-black/40">
                <tr>
                  <th className="px-3 py-2">Sipariş</th>
                  <th className="px-3 py-2">Dosya</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Versiyon</th>
                  <th className="px-3 py-2">Tarih</th>
                  <th className="px-3 py-2 text-right">Detay</th>
                </tr>
              </thead>
              <tbody className="text-black/70">
                {data.map((item) => (
                  <tr key={item.id} className="border-t border-black/5">
                    <td className="px-3 py-3 font-semibold">
                      {(Array.isArray((item as any).orders)
                        ? (item as any).orders[0]?.name
                        : (item as any).orders?.name) ?? "-"}
                    </td>
                    <td className="px-3 py-3">{item.file_name ?? "-"}</td>
                    <td className="px-3 py-3">{item.status ?? "draft"}</td>
                    <td className="px-3 py-3">{item.version ?? 1}</td>
                    <td className="px-3 py-3">{item.created_at ?? "-"}</td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/packing-lists/${item.id}`}
                        className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold"
                      >
                        Aç
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/10 bg-[var(--sand)] px-4 py-3 text-sm text-black/70">
            Henüz packing list yüklenmedi.
          </div>
        )}
      </div>
    </section>
  );
}
// END FEATURE: packing-list/import
