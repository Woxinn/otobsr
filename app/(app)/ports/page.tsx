import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createPort } from "@/app/actions/ports";

export default async function PortsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: ports } = await supabase
    .from("ports")
    .select("id, name, notes, lat, lon")
    .order("name");

  return (
    <section className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500 p-6 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.20),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.18),transparent_40%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/70">Limanlar</p>
            <h1 className="text-3xl font-semibold [font-family:var(--font-display)]">Liman listesi</h1>
            <p className="mt-2 text-sm text-white/80">
              Çıkış / varis noktalarini yonetin, shipmentlara baglayin.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/15 px-4 py-3 text-right shadow-md backdrop-blur">
              <p className="text-xs uppercase tracking-[0.25em] text-white/70">Toplam</p>
              <p className="text-2xl font-bold">{ports?.length ?? 0}</p>
            </div>
            <label
              htmlFor="port-modal"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              Yeni liman
            </label>
          </div>
        </div>
      </div>

      <div className="relative">
        <input id="port-modal" type="checkbox" className="peer hidden" />
        <div className="fixed inset-0 z-40 hidden bg-black/40 backdrop-blur peer-checked:block" />
        <div className="fixed inset-0 z-50 hidden items-center justify-center p-6 peer-checked:flex">
          <div className="w-full max-w-lg rounded-3xl border border-white/20 bg-white/90 p-6 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Yeni liman</h3>
              <label
                htmlFor="port-modal"
                className="cursor-pointer rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold"
              >
                Kapat
              </label>
            </div>
            <form action={createPort} className="mt-4 space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <input
                  name="name"
                  placeholder="Liman adi"
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
                />
                <input
                  name="notes"
                  placeholder="Not"
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
                />
                <input
                  name="lat"
                  type="number"
                  step="0.000001"
                  placeholder="Latitude"
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
                />
                <input
                  name="lon"
                  type="number"
                  step="0.000001"
                  placeholder="Longitude"
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
                />
              </div>
              <button className="rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl">
                Kaydet
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Mevcut limanlar</h3>
            <p className="text-sm text-slate-500">Detay veya duzenle ile kartlara gidin.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {ports?.length ?? 0} kayit
          </span>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          {ports?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
                    <th className="px-3 py-2">Liman</th>
                    <th className="px-3 py-2">Not</th>
                    <th className="px-3 py-2">Koordinat</th>
                    <th className="px-3 py-2">Islemler</th>
                  </tr>
                </thead>
                <tbody>
                  {ports.map((port) => (
                    <tr
                      key={port.id}
                      className="rounded-2xl border border-slate-100 bg-gradient-to-r from-slate-50 to-white shadow-sm"
                    >
                      <td className="px-3 py-3 font-semibold text-slate-900">{port.name ?? "-"}</td>
                      <td className="px-3 py-3 text-slate-600">{port.notes ?? "-"}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {port.lat && port.lon ? `${port.lat}, ${port.lon}` : "â€”"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2 text-xs font-semibold">
                          <Link
                            href={`/ports/${port.id}`}
                            className="rounded-full border border-slate-200 px-3 py-1 text-slate-700 transition hover:border-sky-400 hover:text-sky-600"
                          >
                            Detay
                          </Link>
                          <Link
                            href={`/ports/${port.id}/edit`}
                            className="rounded-full border border-slate-200 px-3 py-1 text-slate-700 transition hover:border-emerald-400 hover:text-emerald-600"
                          >
                            Düzenle
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Henüz liman yok.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

