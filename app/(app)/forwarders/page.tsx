import Link from "next/link";
import { CSSProperties } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createForwarder } from "@/app/actions/master-data";

export default async function ForwardersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: forwarders } = await supabase
    .from("forwarders")
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
          Forwarders
        </p>
        <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
          Nakliyeci listesi
        </h2>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/60">
          Forwarder listesini tablo uzerinden guncelleyebilirsiniz.
        </p>
        <div className="relative">
          <input
            id="forwarder-modal"
            type="checkbox"
            className="peer hidden"
          />
          <label
            htmlFor="forwarder-modal"
            className="cursor-pointer rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
          >
            Yeni forwarder
          </label>
          <div className="fixed inset-0 z-40 hidden bg-black/30 peer-checked:block" />
          <div className="fixed inset-0 z-50 hidden items-center justify-center p-6 peer-checked:flex">
            <div className="w-full max-w-xl rounded-3xl border border-black/10 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Yeni forwarder</h3>
                <label
                  htmlFor="forwarder-modal"
                  className="cursor-pointer rounded-full border border-black/20 px-3 py-1 text-xs font-semibold"
                >
                  Kapat
                </label>
              </div>
              <form action={createForwarder} className="mt-4 space-y-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  <input
                    name="name"
                    placeholder="Forwarder adi"
                    className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    name="contact_name"
                    placeholder="Yetkili kisi"
                    className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    name="email"
                    placeholder="E-posta"
                    className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    name="phone"
                    placeholder="Telefon"
                    className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    name="notes"
                    placeholder="Not"
                    className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm lg:col-span-2"
                  />
                </div>
                <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
                  Kaydet
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[36px] border border-black/10 bg-[radial-gradient(circle_at_top_left,#fff7ed,#fff1f2,#ffffff)] p-6 shadow-[0_40px_80px_-50px_rgba(95,47,13,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-black/40">
              Nakliye panosu
            </p>
            <h3 className="text-lg font-semibold">Mevcut forwarderlar</h3>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm">
            {forwarders?.length ?? 0} kayit
          </span>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          {forwarders?.length ? (
            <div className="overflow-x-auto">
              <div className="min-w-[1120px] rounded-[30px] border border-amber-200/60 bg-[linear-gradient(130deg,#fff7ed,#ffedd5,#fff1f2)] p-3 shadow-inner">
                <table className="w-full border-separate border-spacing-y-4">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.3em] text-black/50">
                      <th className="px-4 pt-2">Forwarder</th>
                      <th className="px-4 pt-2">Yetkili</th>
                      <th className="px-4 pt-2">E-posta</th>
                      <th className="px-4 pt-2">Telefon</th>
                      <th className="px-4 pt-2">Not</th>
                      <th className="px-4 pt-2 text-right">Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forwarders.map((forwarder, index) => {
                      const rowColors = rowColorsFromId(forwarder.id);
                      return (
                        <tr
                          key={forwarder.id}
                          className="group animate-[fade-up_0.35s_ease] transition hover:-translate-y-0.5 [&>td]:border [&>td]:border-amber-200/60 [&>td]:bg-[var(--row-bg)] [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl hover:[&>td]:bg-[linear-gradient(120deg,rgba(251,146,60,0.12),rgba(244,114,182,0.12))]"
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
                                {forwarder.name ?? "-"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">{forwarder.contact_name ?? "-"}</td>
                          <td className="px-4 py-4">{forwarder.email ?? "-"}</td>
                          <td className="px-4 py-4">{forwarder.phone ?? "-"}</td>
                          <td className="px-4 py-4">{forwarder.notes ?? "-"}</td>
                          <td className="px-4 py-4 text-right">
                            <Link
                              href={`/forwarders/${forwarder.id}`}
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
              Henuz forwarder yok.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

