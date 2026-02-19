import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ForwarderQuotesClient from "@/components/ForwarderQuotesClient";
import { updateForwarder } from "@/app/actions/master-data";

export const dynamic = "force-dynamic";

export default async function ForwarderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const supabase = await createSupabaseServerClient();

  const { data: forwarder } = await supabase
    .from("forwarders")
    .select("*")
    .eq("id", resolvedParams.id)
    .single();

  if (!forwarder) {
    notFound();
  }

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, file_no, reference")
    .order("created_at", { ascending: false });

  const { data: quotes } = await supabase
    .from("forwarder_quotes")
    .select(
      "id, shipment_id, amount, currency, container_size, free_time_days, route_option, transit_days, valid_until, notes, is_selected"
    )
    .eq("forwarder_id", forwarder.id)
    .order("created_at", { ascending: false });

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Forwarder detay
          </p>
          <h2 className="text-3xl font-semibold [font-family:var(--font-display)]">
            {forwarder.name}
          </h2>
        </div>
        <Link
          href="/forwarders"
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Listeye don
        </Link>
      </div>

      <form
        action={updateForwarder}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="id" value={forwarder.id} />
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium">
            Forwarder adı
            <input
              name="name"
              defaultValue={forwarder.name ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Yetkili kişi
            <input
              name="contact_name"
              defaultValue={forwarder.contact_name ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            E-posta
            <input
              name="email"
              defaultValue={forwarder.email ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Telefon
            <input
              name="phone"
              defaultValue={forwarder.phone ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-2">
            Not
            <input
              name="notes"
              defaultValue={forwarder.notes ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-4">
          <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
            Güncelle
          </button>
        </div>
      </form>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <p className="text-sm text-black/60">
          Yetkili: <span className="font-semibold text-black/80">{forwarder.contact_name ?? "-"}</span>
        </p>
        <p className="mt-1 text-sm text-black/60">
          E-posta: <span className="font-semibold text-black/80">{forwarder.email ?? "-"}</span>
        </p>
        <p className="mt-1 text-sm text-black/60">
          Telefon: <span className="font-semibold text-black/80">{forwarder.phone ?? "-"}</span>
        </p>
      </div>

      <ForwarderQuotesClient
        forwarderId={forwarder.id}
        shipments={shipments ?? []}
        quotes={quotes ?? []}
      />
    </section>
  );
}
