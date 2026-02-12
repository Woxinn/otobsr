import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CSSProperties } from "react";

export default async function SuppliersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("*")
    .order("name");

  const rowColorsFromId = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
      hash &= hash;
    }
    const hue = Math.abs(hash) % 360;
    return {
      bg: `hsl(${hue}, 80%, 96%)`,
      accent: `hsl(${hue}, 70%, 45%)`,
    };
  };

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-black/40">
          Tedarikçiler
        </p>
        <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
          Tedarikçi listesi
        </h2>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/60">
          Tedarikçileri tablo uzerinden guncelleyebilir, detaya gidebilirsiniz.
        </p>
        <Link
          href="/suppliers/new"
          className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
        >
          Yeni tedarikci
        </Link>
      </div>

      <div className="rounded-[36px] border border-black/10 bg-[radial-gradient(circle_at_top_left,#ffffff,#f6f7fb)] p-6 shadow-[0_40px_80px_-50px_rgba(12,45,52,0.7)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-black/40">
              Tedarikçi panosu
            </p>
            <h3 className="text-lg font-semibold">Mevcut tedarikciler</h3>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black/70 shadow-sm">
            {suppliers?.length ?? 0} kayit
          </span>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          {suppliers?.length ? (
            <div className="overflow-x-auto">
              <div className="min-w-[1120px] rounded-[30px] border border-black/10 bg-[linear-gradient(130deg,#f7f7fb,#eef1f7)] p-3 shadow-inner">
                <table className="w-full border-separate border-spacing-y-4">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.3em] text-black/50">
                      <th className="px-4 pt-2">Tedarikçi</th>
                      <th className="px-4 pt-2">Yetkili</th>
                      <th className="px-4 pt-2">E-posta</th>
                      <th className="px-4 pt-2">Telefon</th>
                      <th className="px-4 pt-2">Sehir</th>
                      <th className="px-4 pt-2">Ulke</th>
                      <th className="px-4 pt-2">Not</th>
                      <th className="px-4 pt-2 text-right">Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((supplier, index) => {
                      const rowColors = rowColorsFromId(supplier.id);
                      return (
                        <tr
                          key={supplier.id}
                          className="group animate-[fade-up_0.35s_ease] transition hover:-translate-y-0.5 [&>td]:border [&>td]:border-black/10 [&>td]:bg-[var(--row-bg)] [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl hover:[&>td]:bg-[linear-gradient(120deg,rgba(11,47,54,0.06),rgba(242,166,90,0.14))]"
                          style={
                            {
                              animationDelay: `${index * 45}ms`,
                              ["--row-bg" as string]: rowColors.bg,
                              ["--row-accent" as string]: rowColors.accent,
                            } as CSSProperties
                          }
                        >
                          <td className="px-4 py-4 text-xs font-semibold text-black/80">
                            <div className="flex items-center gap-3">
                              <span
                                className="h-9 w-1.5 rounded-full"
                                style={{ backgroundColor: "var(--row-accent)" }}
                              />
                              <span className="text-sm font-semibold">
                                {supplier.name ?? "-"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">{supplier.contact_name ?? "-"}</td>
                          <td className="px-4 py-4">{supplier.email ?? "-"}</td>
                          <td className="px-4 py-4">{supplier.phone ?? "-"}</td>
                          <td className="px-4 py-4">{supplier.city ?? "-"}</td>
                          <td className="px-4 py-4">{supplier.country ?? "-"}</td>
                          <td className="px-4 py-4">{supplier.notes ?? "-"}</td>
                          <td className="px-4 py-4 text-right">
                            <Link
                              href={`/suppliers/${supplier.id}`}
                              className="rounded-full border border-black/20 px-4 py-2 text-xs font-semibold transition group-hover:border-black/40"
                            >
                              Detay
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
              Henüz tedarikci yok.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}


