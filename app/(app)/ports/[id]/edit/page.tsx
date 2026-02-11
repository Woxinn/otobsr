import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePort } from "@/app/actions/ports";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PortEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: port } = await supabase
    .from("ports")
    .select("id, name, notes, lat, lon")
    .eq("id", id)
    .maybeSingle();

  if (!port) notFound();

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-sky-500 via-emerald-500 to-indigo-500 p-6 text-white shadow-xl">
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/70">Liman</p>
            <h1 className="text-3xl font-semibold [font-family:var(--font-display)]">{port.name}</h1>
            <p className="text-sm text-white/80">Koordinat: {port.lat && port.lon ? `${port.lat}, ${port.lon}` : "—"}</p>
          </div>
          <Link
            href={`/ports/${port.id}`}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            Detaya dön
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-100">
        <form action={updatePort} className="space-y-4">
          <input type="hidden" name="id" value={port.id} />
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>Liman adı</span>
            <input
              name="name"
              defaultValue={port.name ?? ""}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
            />
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>Not</span>
            <input
              name="notes"
              defaultValue={port.notes ?? ""}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
            />
          </label>
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              <span>Latitude</span>
              <input
                name="lat"
                type="number"
                step="0.000001"
                defaultValue={port.lat ?? ""}
                placeholder="Enlem"
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              <span>Longitude</span>
              <input
                name="lon"
                type="number"
                step="0.000001"
                defaultValue={port.lon ?? ""}
                placeholder="Boylam"
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              />
            </label>
          </div>
          <button className="rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl">
            Kaydet
          </button>
        </form>
      </div>
    </section>
  );
}
