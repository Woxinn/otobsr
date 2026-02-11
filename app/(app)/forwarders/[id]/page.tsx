import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ForwarderQuotesClient from "@/components/ForwarderQuotesClient";

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
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-black/40">
              Forwarder detay
            </p>
            <h2 className="text-3xl font-semibold [font-family:var(--font-display)]">
              {forwarder.name}
            </h2>
            <div className="mt-2 text-sm text-black/60">
              <p>Yetkili: {forwarder.contact_name ?? "-"}</p>
              <p>E-posta: {forwarder.email ?? "-"}</p>
              <p>Telefon: {forwarder.phone ?? "-"}</p>
              <p>Not: {forwarder.notes ?? "-"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/forwarders"
              className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
            >
              Listeye don
            </Link>
          </div>
        </div>
      </div>

      <ForwarderQuotesClient
        forwarderId={forwarder.id}
        shipments={shipments ?? []}
        quotes={quotes ?? []}
      />
    </section>
  );
}
