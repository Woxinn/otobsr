import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";
import RfqActionBar from "@/components/RfqActionBar";
import QuoteModal from "@/components/QuoteModal";

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) {
    return <div className="p-6 text-sm text-red-600">Erişim yok.</div>;
  }

  const { data: rfq } = await supabase
    .from("rfqs")
    .select(
      "id, code, title, notes, status, response_due_date, currency, incoterm, target_suppliers, created_at, rfq_items(id, quantity, product_code, product_name, products(code, name, brand)), rfq_suppliers(supplier_id, suppliers(name)), rfq_quotes(id, supplier_id, transit_time, currency, total_amount, rfq_quote_items(rfq_item_id, unit_price), suppliers(name))"
    )
    .eq("id", id)
    .maybeSingle();

  if (!rfq) return notFound();

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">RFQ</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">{rfq.code}</h1>
          <p className="text-sm text-black/60">{rfq.title}</p>
          <p className="text-xs text-black/50">
            Para birimi: {rfq.currency ?? "-"} • Incoterm: {rfq.incoterm ?? "-"} • Son yanıt:{" "}
            {rfq.response_due_date ?? "-"}
          </p>
        </div>
        <Link
          href="/rfqs"
          className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70"
        >
          Listeye dön
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-black/70">Ürünler</h2>
            <QuoteModal
              rfqId={rfq.id}
              rfqItems={rfq.rfq_items ?? []}
              suppliers={(rfq.rfq_suppliers ?? []).map((s: any) => ({
                id: s.supplier_id,
                name: s.suppliers?.name ?? s.supplier_id,
              }))}
            />
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.28em] text-black/50">
              <tr>
                <th className="px-3 py-2">Kod</th>
                <th className="px-3 py-2">Ürün</th>
                <th className="px-3 py-2 text-right">Miktar</th>
              </tr>
            </thead>
            <tbody>
              {(rfq.rfq_items ?? []).map((item: any) => {
                const prod = Array.isArray(item.products) ? item.products[0] : item.products;
                return (
                  <tr key={item.id} className="border-b border-black/5 last:border-none">
                    <td className="px-3 py-3 font-semibold">{item.product_code ?? prod?.code ?? "-"}</td>
                    <td className="px-3 py-3">{item.product_name ?? prod?.name ?? "-"}</td>
                    <td className="px-3 py-3 text-right">{item.quantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <RfqActionBar rfqId={rfq.id} status={rfq.status} />
          <div className="flex justify-between text-sm">
            <span>Durum</span>
            <span className="font-semibold capitalize">{rfq.status}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Son yanıt</span>
            <span className="font-semibold">{rfq.response_due_date ?? "-"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Oluşturma</span>
            <span className="font-semibold">{new Date(rfq.created_at).toLocaleString("tr-TR")}</span>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-black/50">Tedarikçiler</h3>
            <ul className="space-y-1 text-sm text-black/70">
              {(rfq.rfq_suppliers ?? []).map((row: any, idx: number) => (
                <li key={idx} className="rounded-lg border border-black/5 bg-black/5 px-3 py-2">
                  {row.suppliers?.name ?? row.supplier_id ?? "-"}
                </li>
              ))}
              {!rfq.rfq_suppliers?.length ? <li className="text-black/40">Tanımlı tedarikçi yok</li> : null}
            </ul>
          </div>
          {rfq.notes ? <p className="mt-3 text-sm text-black/70">{rfq.notes}</p> : null}
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-black/70">Teklif karşılaştırma</h2>
        </div>
        {rfq.rfq_quotes?.length ? (
          (() => {
            const quoteSuppliers: any[] = Array.from(
              new Map(
                (rfq.rfq_quotes ?? []).map((q: any) => [
                  q.supplier_id,
                  {
                    id: q.supplier_id,
                    name: q.suppliers?.name ?? q.supplier_id,
                    transit: q.transit_time,
                    currency: q.currency,
                    quote: q,
                  },
                ])
              ).values()
            );
            return (
              <div className="overflow-x-auto rounded-2xl border border-black/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 text-left text-[11px] uppercase tracking-[0.22em] text-black/50">
                    <tr>
                      <th className="px-4 py-3 border-r border-black/10">Ürün</th>
                      {quoteSuppliers.map((s) => (
                        <th key={s.id} className="px-4 py-3 text-right border-l border-black/10">
                          <div className="flex justify-end">
                            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--ocean)]/10 px-3 py-1 text-[12px] font-semibold text-[var(--ocean)]">
                              <span className="h-2 w-2 rounded-full bg-[var(--ocean)]" />
                              {s.name}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-black/50">
                            <span className="rounded-full bg-black/5 px-2 py-[2px]">
                              {s.currency ?? "-"}
                            </span>
                            <span className="rounded-full bg-black/5 px-2 py-[2px]">
                              {s.transit ? `${s.transit} gün` : "-"}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(rfq.rfq_items ?? []).map((it: any, idx: number) => (
                      <tr
                        key={it.id}
                        className={`border-t border-black/10 ${
                          idx % 2 === 0 ? "bg-white" : "bg-black/2.5"
                        }`}
                      >
                        <td className="px-4 py-3 border-r border-black/10">
                          <div className="font-semibold text-black">{it.product_code ?? "-"}</div>
                          <div className="text-xs text-black/60">{it.product_name ?? "-"}</div>
                        </td>
                        {quoteSuppliers.map((s) => {
                          const price = s.quote?.rfq_quote_items?.find(
                            (qi: any) => qi.rfq_item_id === it.id
                          )?.unit_price;
                          const display = price ?? "-";
                          return (
                            <td key={s.id} className="px-4 py-3 text-right border-l border-black/10">
                              <span
                                className={`inline-block rounded-lg px-2 py-1 ${
                                  price ? "bg-[var(--mint)]/40 text-black" : "text-black/40"
                                }`}
                              >
                                {display} {s.currency ?? ""}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : (
          <p className="text-sm text-black/60">Henüz teklif yok.</p>
        )}
      </div>
    </section>
  );
}

