import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PortDetailPage({
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

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, file_no, status, origin_port_id, destination_port_id")
    .or(`origin_port_id.eq.${id},destination_port_id.eq.${id}`)
    .order("created_at", { ascending: false });

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 p-6 text-white shadow-xl">
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/70">Liman</p>
            <h1 className="text-3xl font-semibold [font-family:var(--font-display)]">{port.name}</h1>
            <p className="mt-2 text-sm text-white/80">{port.notes || "Not yok"}</p>
            <p className="mt-2 text-sm text-white/80">
              Koordinat: {port.lat && port.lon ? `${port.lat}, ${port.lon}` : "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/ports/${port.id}/edit`}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              Düzenle
            </Link>
            <Link
              href="/ports"
              className="rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              Listeye dön
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Bağlı shipmentlar</h3>
            <p className="text-sm text-slate-500">
              Bu limanı çıkış/varış olarak kullanan shipmentlar listelenir.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {shipments?.length ?? 0} kayıt
          </span>
        </div>

        {shipments?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {shipments.map((s) => {
              const role = s.destination_port_id === port.id ? "Varış" : "Çıkış";
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-100 bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{s.file_no ?? s.id}</p>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{s.status}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {role}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <Link
                      href={`/shipments/${s.id}`}
                      className="rounded-full border border-slate-200 px-3 py-1 text-slate-700 transition hover:border-sky-400 hover:text-sky-600"
                    >
                      Shipment detayı
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Bağlı shipment bulunamadı.
          </div>
        )}
      </div>
    </section>
  );
}
