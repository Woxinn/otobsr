import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDocument } from "@/app/actions/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";
import RfqActionBar from "@/components/RfqActionBar";
import QuoteModal from "@/components/QuoteModal";
import RfqImportModal from "@/components/RfqImportModal";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: rfq } = await supabase
    .from("rfqs")
    .select("code, title")
    .eq("id", id)
    .maybeSingle();
  const title = rfq?.title || rfq?.code || "RFQ";
  return { title: `RFQ | ${title}` };
}
import RfqQuoteGrid from "@/components/RfqQuoteGrid";
import ConfirmActionForm from "@/components/ConfirmActionForm";
import DocumentUploader from "@/components/DocumentUploader";
import DocumentDownloadButton from "@/components/DocumentDownloadButton";
import SupplierQuoteList from "@/components/SupplierQuoteList";
import RfqConvertModal from "@/components/RfqConvertModal";
import RfqItemDeleteButton from "@/components/RfqItemDeleteButton";
import RfqSupplierAdder from "@/components/RfqSupplierAdder";
import RfqTargetPriceField from "@/components/RfqTargetPriceField";

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) {
    return <div className="p-6 text-sm text-red-600">Erişim yok.</div>;
  }

  const pageSize = 1000;
  const fetchAll = async <T,>(queryFactory: (from: number, to: number) => any) => {
    const all: T[] = [];
    for (let from = 0; ; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = await queryFactory(from, to);
      if (error) return { data: null as T[] | null, error };
      const rows = data ?? [];
      all.push(...rows);
      if (rows.length < pageSize) break;
    }
    return { data: all, error: null };
  };

  let rfqBase: any = null;
  {
    const { data, error } = await supabase
      .from("rfqs")
      .select(
        "id, code, title, notes, status, response_due_date, currency, incoterm, target_suppliers, created_at, selected_supplier_id, selected_quote_id"
      )
      .eq("id", id)
      .maybeSingle();
    if (error && error.code === "42703") {
      const { data: fallback, error: fallbackErr } = await supabase
        .from("rfqs")
        .select("id, code, title, notes, status, response_due_date, currency, incoterm, target_suppliers, created_at")
        .eq("id", id)
        .maybeSingle();
      if (fallbackErr) {
        return (
          <div className="p-6 text-sm text-red-600">
            RFQ yüklenemedi: {fallbackErr.message ?? "bilinmeyen hata"}
          </div>
        );
      }
      rfqBase = { ...fallback, selected_supplier_id: null, selected_quote_id: null };
    } else if (error) {
      return (
        <div className="p-6 text-sm text-red-600">
          RFQ yüklenemedi: {error.message ?? "bilinmeyen hata"}
        </div>
      );
    } else {
      rfqBase = data;
    }
  }
  if (!rfqBase) return notFound();

  const fmtNum = (value: number | string | null | undefined, maxFraction = 2) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return String(value ?? "-");
    return num.toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFraction,
    });
  };

  const { data: rawItems, error: itemsErr } = await fetchAll<any>((from, to) =>
    supabase
      .from("rfq_items")
      .select("id, rfq_id, product_id, quantity, product_code, product_name, target_unit_price")
      .eq("rfq_id", id)
      .range(from, to)
  );
  if (itemsErr) {
    return <div className="p-6 text-sm text-red-600">RFQ kalemleri okunamadi: {itemsErr.message}</div>;
  }

  const productIds = Array.from(new Set((rawItems ?? []).map((i: any) => i.product_id).filter(Boolean)));
  const productById = new Map<
    string,
    {
      code: string | null;
      name: string | null;
      brand: string | null;
      domestic_cost_percent: number | null;
      gtip: any | null;
    }
  >();
  for (let i = 0; i < productIds.length; i += 500) {
    const chunk = productIds.slice(i, i + 500);
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select(
        `
        id, code, name, brand, domestic_cost_percent,
        gtip:gtips(
          id, code, customs_duty_rate, additional_duty_rate,
          anti_dumping_applicable, anti_dumping_rate,
          surveillance_applicable, surveillance_unit_value
        )
      `
      )
      .in("id", chunk);
    if (prodErr) {
      return <div className="p-6 text-sm text-red-600">Urunler okunamadi: {prodErr.message}</div>;
    }
    (products ?? []).forEach((p: any) =>
      productById.set(String(p.id), {
        code: p.code ?? null,
        name: p.name ?? null,
        brand: p.brand ?? null,
        domestic_cost_percent: p.domestic_cost_percent ?? null,
        gtip: p.gtip ?? null,
      })
    );
  }

  const rfqItems = (rawItems ?? []).map((item: any) => {
    const prod = item.product_id ? productById.get(String(item.product_id)) : null;
    const resolvedCode = prod?.code ?? item.product_code ?? null;
    const resolvedName = prod?.name ?? item.product_name ?? null;
    return {
      ...item,
      product_code: resolvedCode,
      product_name: resolvedName,
      products: prod ?? null,
      domestic_cost_percent: prod?.domestic_cost_percent ?? null,
      gtip: prod?.gtip ?? null,
      weight_kg: null,
    };
  });

  const { data: rfqSuppliers, error: rfqSuppliersErr } = await supabase
    .from("rfq_suppliers")
    .select("supplier_id, suppliers(name)")
    .eq("rfq_id", id);
  if (rfqSuppliersErr) {
    return <div className="p-6 text-sm text-red-600">Tedarikciler okunamadi: {rfqSuppliersErr.message}</div>;
  }

  const selectedSupplierIds = new Set((rfqSuppliers ?? []).map((row: any) => String(row.supplier_id)));
  const { data: allSuppliers, error: allSuppliersErr } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name", { ascending: true });
  if (allSuppliersErr) {
    return <div className="p-6 text-sm text-red-600">Tedarikci listesi okunamadi: {allSuppliersErr.message}</div>;
  }
  const availableSuppliers = (allSuppliers ?? []).filter((row: any) => !selectedSupplierIds.has(String(row.id)));

  const { data: rawQuotes, error: quotesErr } = await fetchAll<any>((from, to) =>
    supabase
      .from("rfq_quotes")
      .select("id, rfq_id, supplier_id, transit_time, currency, total_amount, suppliers(name)")
      .eq("rfq_id", id)
      .range(from, to)
  );
  if (quotesErr) {
    return <div className="p-6 text-sm text-red-600">Teklifler okunamadi: {quotesErr.message}</div>;
  }

  const quoteIds = (rawQuotes ?? []).map((q: any) => String(q.id));
  const quoteItemByQuoteId = new Map<string, any[]>();
  for (let i = 0; i < quoteIds.length; i += 200) {
    const quoteChunk = quoteIds.slice(i, i + 200);
    const { data: quoteItems, error: quoteItemsErr } = await fetchAll<any>((from, to) =>
      supabase
        .from("rfq_quote_items")
        .select("id, rfq_quote_id, rfq_item_id, unit_price")
        .in("rfq_quote_id", quoteChunk)
        .range(from, to)
    );
    if (quoteItemsErr) {
      return <div className="p-6 text-sm text-red-600">Teklif kalemleri okunamadi: {quoteItemsErr.message}</div>;
    }
    (quoteItems ?? []).forEach((qi: any) => {
      const key = String(qi.rfq_quote_id);
      const arr = quoteItemByQuoteId.get(key) ?? [];
      arr.push(qi);
      quoteItemByQuoteId.set(key, arr);
    });
  }

  const rfq = {
    ...rfqBase,
    rfq_items: rfqItems,
    rfq_suppliers: rfqSuppliers ?? [],
    rfq_quotes: (rawQuotes ?? []).map((q: any) => ({
      ...q,
      rfq_quote_items: quoteItemByQuoteId.get(String(q.id)) ?? [],
    })),
  };

  const { data: documents } = await supabase
    .from("documents")
    .select("id, file_name, storage_path, uploaded_at, notes")
    .ilike("notes", `%rfq:${id}%`)
    .order("uploaded_at", { ascending: false });

  const { data: proformaDocType } = await supabase
    .from("document_types")
    .select("id, name, code")
    .eq("code", "PROFORMA")
    .limit(1)
    .maybeSingle();

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
        <RfqImportModal rfqId={rfq.id} />
        <Link
          href={`/api/rfq/export?rfq_id=${rfq.id}`}
          className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70 hover:bg-black/5"
        >
          Excel export
        </Link>
        <RfqConvertModal
          rfqId={rfq.id}
          supplierId={(rfq as any).selected_supplier_id ?? null}
          currency={rfq.currency ?? null}
          items={(rfq.rfq_items ?? []).map((it: any) => {
            const quote = (rfq.rfq_quotes ?? []).find((q: any) => q.supplier_id === (rfq as any).selected_supplier_id);
            const qi = quote?.rfq_quote_items?.find((x: any) => x.rfq_item_id === it.id);
            return {
              id: it.id,
              product_code: it.product_code,
              product_name: it.product_name,
              quantity: it.quantity,
              price: qi?.unit_price ?? null,
            };
          })}
        />
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
                <th className="px-3 py-2 text-right">Hedef fiyat</th>
                <th className="px-3 py-2 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {(rfq.rfq_items ?? []).map((item: any) => {
                return (
                  <tr key={item.id} className="border-b border-black/5 last:border-none">
                    <td className="px-3 py-3 font-semibold">{item.product_code ?? "-"}</td>
                    <td className="px-3 py-3">{item.product_name ?? "-"}</td>
                    <td className="px-3 py-3 text-right">{fmtNum(item.quantity, 2)}</td>
                    <td className="px-3 py-3 text-right">
                      <RfqTargetPriceField
                        rfqId={rfq.id}
                        rfqItemId={item.id}
                        value={item.target_unit_price ?? null}
                        currency={rfq.currency ?? null}
                      />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <RfqItemDeleteButton
                        rfqId={rfq.id}
                        rfqItemId={item.id}
                        productCode={item.product_code ?? null}
                      />
                    </td>
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
            <div className="mb-3">
              <RfqSupplierAdder
                rfqId={rfq.id}
                suppliers={availableSuppliers.map((row: any) => ({
                  id: String(row.id),
                  name: row.name ?? String(row.id),
                }))}
              />
            </div>
            <SupplierQuoteList
              rfqId={rfq.id}
              suppliers={(rfq.rfq_suppliers ?? []).map((row: any) => ({
                id: row.supplier_id,
                name: row.suppliers?.name ?? row.supplier_id ?? "-",
                hasQuote: (rfq.rfq_quotes ?? []).some((q: any) => q.supplier_id === row.supplier_id),
                isSelected: (rfq as any).selected_supplier_id === row.supplier_id,
                quoteId: (rfq as any).selected_quote_id,
              }))}
            />
          </div>
          {rfq.notes ? <p className="mt-3 text-sm text-black/70">{rfq.notes}</p> : null}
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-black/70">Teklif karşılaştırma</h2>
        </div>
        <RfqQuoteGrid
          rfqId={rfq.id}
          currency={rfq.currency ?? null}
          items={rfq.rfq_items ?? []}
          suppliers={Array.from(
            new Map(
              (rfq.rfq_quotes ?? []).map((q: any) => [
                q.supplier_id,
                {
                  id: q.supplier_id,
                  name: q.suppliers?.name ?? q.supplier_id,
                  transit: q.transit_time,
                  currency: q.currency,
                  quote_items: q.rfq_quote_items ?? [],
                },
              ])
            ).values()
          ) as any[]}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-black/70 mb-3">Belgeler</h2>
          <ul className="space-y-2 text-sm text-black/70">
            {(documents ?? []).map((doc: any) => (
              <li key={doc.id} className="flex items-center justify-between rounded-xl border border-black/10 bg-black/5 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate">{doc.file_name}</div>
                  <div className="text-[11px] text-black/50">{doc.uploaded_at?.slice(0, 10) ?? ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  {doc.storage_path ? <DocumentDownloadButton storagePath={doc.storage_path} label="Gor" /> : null}
                  <ConfirmActionForm
                    action={deleteDocument}
                    confirmText="Bu belgeyi silmek istiyor musun?"
                    buttonText="Sil"
                    className="contents"
                    buttonClassName="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                  >
                    <input type="hidden" name="document_id" value={doc.id} />
                    <input type="hidden" name="rfq_id" value={rfq.id} />
                  </ConfirmActionForm>
                </div>
              </li>
            ))}
            {!documents?.length ? <li className="text-black/40">Henüz belge yok</li> : null}
          </ul>
        </div>
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm md:col-span-2">
          {proformaDocType ? (
            <DocumentUploader rfqId={rfq.id} documentTypes={[{ id: proformaDocType.id, name: proformaDocType.name }]} />
          ) : (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              Proforma belge tipi bulunamadi. `document_types` tablosunda `Proforma` kaydi gerekli.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

