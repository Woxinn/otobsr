import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDocument } from "@/app/actions/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canEdit, canViewModule, getCurrentUserRole } from "@/lib/roles";
import RfqActionBar from "@/components/RfqActionBar";
import QuoteModal from "@/components/QuoteModal";
import RfqImportModal from "@/components/RfqImportModal";
import type { Metadata } from "next";
import {
  ArrowLeft,
  CalendarDays,
  Download,
  FileSpreadsheet,
  PackageSearch,
  Send,
  Trophy,
  Users,
} from "lucide-react";

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
import RfqItemQuantityField from "@/components/RfqItemQuantityField";
import { pickWeightKg } from "@/lib/gtipCost";

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const canEditPage = canEdit(role);
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
      gtip_id: string | null;
    }
  >();
  for (let i = 0; i < productIds.length; i += 500) {
    const chunk = productIds.slice(i, i + 500);
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select(
        `
        id, code, name, brand, domestic_cost_percent, gtip_id,
        gtip:gtips(
          id, code, customs_duty_rate, additional_duty_rate, vat_rate,
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
        gtip_id: p.gtip_id ?? null,
      })
    );
  }

  const gtipIds = Array.from(
    new Set(
      Array.from(productById.values())
        .map((product) => product.gtip_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const ratesByGtip = new Map<string, any[]>();
  for (let i = 0; i < gtipIds.length; i += 500) {
    const chunk = gtipIds.slice(i, i + 500);
    const { data: rates, error: ratesErr } = await supabase
      .from("gtip_country_rates")
      .select(
        "gtip_id, country, customs_duty_rate, additional_duty_rate, anti_dumping_applicable, anti_dumping_rate, surveillance_applicable, surveillance_unit_value, vat_rate"
      )
      .in("gtip_id", chunk);
    if (ratesErr) {
      return <div className="p-6 text-sm text-red-600">Ulke bazli GTIP oranlari okunamadi: {ratesErr.message}</div>;
    }
    (rates ?? []).forEach((row: any) => {
      if (!row.gtip_id) return;
      const current = ratesByGtip.get(String(row.gtip_id)) ?? [];
      current.push(row);
      ratesByGtip.set(String(row.gtip_id), current);
    });
  }

  const attributeValuesByProductId = new Map<string, any[]>();
  for (let i = 0; i < productIds.length; i += 500) {
    const chunk = productIds.slice(i, i + 500);
    const { data: attributeValues, error: attributeErr } = await supabase
      .from("product_attribute_values")
      .select("product_id, value_text, value_number, product_attributes(name, value_type)")
      .in("product_id", chunk);
    if (attributeErr) {
      return <div className="p-6 text-sm text-red-600">Urun agirlik nitelikleri okunamadi: {attributeErr.message}</div>;
    }
    (attributeValues ?? []).forEach((row: any) => {
      const productId = row.product_id ? String(row.product_id) : null;
      if (!productId) return;
      const current = attributeValuesByProductId.get(productId) ?? [];
      current.push(row);
      attributeValuesByProductId.set(productId, current);
    });
  }

  const rfqItems = (rawItems ?? []).map((item: any) => {
    const prod = item.product_id ? productById.get(String(item.product_id)) : null;
    const resolvedCode = prod?.code ?? item.product_code ?? null;
    const resolvedName = prod?.name ?? item.product_name ?? null;
    const rawAttributes = item.product_id ? attributeValuesByProductId.get(String(item.product_id)) ?? [] : [];
    const weightSource = rawAttributes.map((raw: any) => {
      const attr = Array.isArray(raw.product_attributes) ? raw.product_attributes[0] : raw.product_attributes;
      return {
        name: attr?.name,
        value: attr?.value_type === "number" ? raw.value_number : raw.value_text,
      };
    });
    return {
      ...item,
      product_code: resolvedCode,
      product_name: resolvedName,
      products: prod ?? null,
      domestic_cost_percent: prod?.domestic_cost_percent ?? null,
      gtip: prod?.gtip ?? null,
      country_rates: prod?.gtip_id ? ratesByGtip.get(String(prod.gtip_id)) ?? [] : [],
      weight_kg: pickWeightKg(weightSource as any[]),
    };
  });

  const { data: rfqSuppliers, error: rfqSuppliersErr } = await supabase
    .from("rfq_suppliers")
    .select("supplier_id, suppliers(name, country)")
    .eq("rfq_id", id);
  if (rfqSuppliersErr) {
    return <div className="p-6 text-sm text-red-600">Tedarikciler okunamadi: {rfqSuppliersErr.message}</div>;
  }

  const selectedSupplierIds = new Set((rfqSuppliers ?? []).map((row: any) => String(row.supplier_id)));
  const { data: allSuppliers, error: allSuppliersErr } = await supabase
    .from("suppliers")
    .select("id, name, country")
    .order("name", { ascending: true });
  if (allSuppliersErr) {
    return <div className="p-6 text-sm text-red-600">Tedarikci listesi okunamadi: {allSuppliersErr.message}</div>;
  }
  const availableSuppliers = (allSuppliers ?? []).filter((row: any) => !selectedSupplierIds.has(String(row.id)));

  const { data: rawQuotes, error: quotesErr } = await fetchAll<any>((from, to) =>
    supabase
      .from("rfq_quotes")
      .select("id, rfq_id, supplier_id, transit_time, currency, total_amount, suppliers(name, country)")
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

  const rfqSupplierRows = rfq.rfq_suppliers ?? [];
  const rfqQuoteRows = rfq.rfq_quotes ?? [];
  const quoteSuppliers = Array.from(
    new Map(
      rfqQuoteRows.map((q: any) => [
        q.supplier_id,
        {
          id: q.supplier_id,
          name: q.suppliers?.name ?? q.supplier_id,
          country: q.suppliers?.country ?? null,
          transit: q.transit_time,
          currency: q.currency,
          quote_items: q.rfq_quote_items ?? [],
        },
      ])
    ).values()
  ) as any[];
  const quotedSupplierIds = new Set(rfqQuoteRows.map((q: any) => String(q.supplier_id)));
  const itemCount = (rfq.rfq_items ?? []).length;
  const supplierCount = rfqSupplierRows.length;
  const quotedSupplierCount = rfqSupplierRows.filter((row: any) => quotedSupplierIds.has(String(row.supplier_id))).length;
  const totalQty = (rfq.rfq_items ?? []).reduce((sum: number, item: any) => {
    const qty = Number(item.quantity ?? 0);
    return Number.isFinite(qty) ? sum + qty : sum;
  }, 0);
  const targetTotalPreview = (rfq.rfq_items ?? []).reduce((sum: number, item: any) => {
    const qty = Number(item.quantity ?? 0);
    const target = Number(item.target_unit_price ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(target) || qty <= 0 || target <= 0) return sum;
    return sum + qty * target;
  }, 0);
  const selectedSupplierName =
    rfqSupplierRows.find((row: any) => row.supplier_id === (rfq as any).selected_supplier_id)?.suppliers?.name ??
    quoteSuppliers.find((supplier: any) => supplier.id === (rfq as any).selected_supplier_id)?.name ??
    null;
  const statCards = [
    {
      label: "Kalem",
      value: itemCount.toLocaleString("tr-TR"),
      helper: `${fmtNum(totalQty, 2)} RFQ adet`,
      icon: PackageSearch,
      tone: "border-sky-200 bg-sky-50 text-sky-950",
    },
    {
      label: "Tedarikçi",
      value: `${quotedSupplierCount}/${supplierCount}`,
      helper: "Teklif veren / hedef",
      icon: Users,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
    },
    {
      label: "Hedef toplam",
      value: targetTotalPreview ? fmtNum(targetTotalPreview, 2) : "-",
      helper: rfq.currency ?? "Para birimi yok",
      icon: FileSpreadsheet,
      tone: "border-amber-200 bg-amber-50 text-amber-950",
    },
    {
      label: "Kazanan",
      value: selectedSupplierName ?? "-",
      helper: selectedSupplierName ? "Seçili tedarikçi" : "Henüz seçim yok",
      icon: Trophy,
      tone: "border-rose-200 bg-rose-50 text-rose-950",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-black/10 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] uppercase tracking-[0.24em] text-black/40">RFQ</p>
              <span className="rounded-md bg-[#101817] px-2 py-1 text-[11px] font-semibold text-white">
                {rfq.code}
              </span>
              <span className="rounded-md border border-black/10 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-black/60">
                {rfq.currency ?? "-"}
              </span>
              <span className="rounded-md border border-black/10 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-black/60">
                {rfq.incoterm ?? "-"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-black/10 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-black/60">
                <CalendarDays className="h-3.5 w-3.5" />
                {rfq.response_due_date ?? "-"}
              </span>
            </div>
            <h1 className="mt-2 text-xl font-semibold leading-tight [font-family:var(--font-display)]">{rfq.title}</h1>
            {rfq.notes ? <p className="mt-1 line-clamp-1 text-xs text-black/55">{rfq.notes}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/rfqs"
              className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/65 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Liste
            </Link>
            {canEditPage ? <RfqImportModal rfqId={rfq.id} /> : null}
            <Link
              href={`/api/rfq/export?rfq_id=${rfq.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/65 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Excel
            </Link>
            {canEditPage ? (
              <RfqConvertModal
                rfqId={rfq.id}
                supplierId={(rfq as any).selected_supplier_id ?? null}
                currency={rfq.currency ?? null}
                items={(rfq.rfq_items ?? []).map((it: any) => {
                  const quote = (rfq.rfq_quotes ?? []).find(
                    (q: any) => q.supplier_id === (rfq as any).selected_supplier_id
                  );
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
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {statCards.map((item) => {
            const Icon = item.icon;
            return (
              <span
                key={item.label}
                className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-xs font-semibold text-black/70"
                title={item.helper}
              >
                <Icon className="h-3.5 w-3.5 text-black/45" />
                <span className="text-black/45">{item.label}</span>
                <span className="max-w-[12rem] truncate text-black">{item.value}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-black/40">Çalışma masası</p>
            <h2 className="mt-1 text-lg font-semibold [font-family:var(--font-display)]">Teklif matrisi</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-black/55">
            <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5">{quoteSuppliers.length} teklif</span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5">
              <Send className="h-3.5 w-3.5" />
              {quotedSupplierCount}/{supplierCount} cevap
            </span>
          </div>
        </div>
        <RfqQuoteGrid
          rfqId={rfq.id}
          readOnly={!canEditPage}
          currency={rfq.currency ?? null}
          items={rfq.rfq_items ?? []}
          suppliers={quoteSuppliers}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <details className="group rounded-lg border border-black/10 bg-white p-3 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-black/40">Kalemler</p>
              <h3 className="mt-1 text-sm font-semibold text-black">Ürünler ve hedef fiyat</h3>
            </div>
            <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-black/55">
              {itemCount} kalem
            </span>
          </summary>
          <div className="mt-3 border-t border-black/10 pt-3">
            <div className="mb-3 flex justify-end">
              {canEditPage ? (
                <QuoteModal
                  rfqId={rfq.id}
                  rfqItems={rfq.rfq_items ?? []}
                  suppliers={(rfq.rfq_suppliers ?? []).map((s: any) => ({
                    id: s.supplier_id,
                    name: s.suppliers?.name ?? s.supplier_id,
                  }))}
                />
              ) : null}
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[660px] text-sm">
                <thead className="sticky top-0 z-10 border-b border-black/10 bg-white text-left text-[11px] uppercase tracking-[0.18em] text-black/40">
                  <tr>
                    <th className="px-3 py-2">Kod</th>
                    <th className="px-3 py-2">Ürün</th>
                    <th className="px-3 py-2 text-right">Miktar</th>
                    <th className="px-3 py-2 text-right">Hedef</th>
                    {canEditPage ? <th className="px-3 py-2 text-right">Aksiyon</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {(rfq.rfq_items ?? []).map((item: any) => (
                    <tr key={item.id} className="border-b border-black/5 transition hover:bg-slate-50 last:border-none">
                      <td className="px-3 py-2 font-semibold text-black">{item.product_code ?? "-"}</td>
                      <td className="px-3 py-2 text-black/70">{item.product_name ?? "-"}</td>
                      <td className="px-3 py-2 text-right">
                        {canEditPage ? (
                          <RfqItemQuantityField rfqId={rfq.id} rfqItemId={item.id} value={item.quantity ?? null} />
                        ) : (
                          fmtNum(item.quantity, 2)
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canEditPage ? (
                          <RfqTargetPriceField
                            rfqId={rfq.id}
                            rfqItemId={item.id}
                            value={item.target_unit_price ?? null}
                            currency={rfq.currency ?? null}
                          />
                        ) : (
                          <span className="text-black/75">
                            {item.target_unit_price != null ? `${item.target_unit_price} ${rfq.currency ?? ""}` : "-"}
                          </span>
                        )}
                      </td>
                      {canEditPage ? (
                        <td className="px-3 py-2 text-right">
                          <RfqItemDeleteButton
                            rfqId={rfq.id}
                            rfqItemId={item.id}
                            productCode={item.product_code ?? null}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <details className="group rounded-lg border border-black/10 bg-white p-3 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-black/40">Kontrol</p>
              <h3 className="mt-1 text-sm font-semibold text-black">Durum ve tedarikçiler</h3>
            </div>
            <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-black/55">
              {quotedSupplierCount}/{supplierCount}
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-black/10 pt-3">
            {canEditPage ? <RfqActionBar rfqId={rfq.id} status={rfq.status} /> : null}
            <div className="grid gap-2 text-sm sm:grid-cols-3 xl:grid-cols-1">
              <div className="flex justify-between rounded-lg border border-black/10 bg-slate-50 px-3 py-2">
                <span>Durum</span>
                <span className="font-semibold capitalize">{rfq.status}</span>
              </div>
              <div className="flex justify-between rounded-lg border border-black/10 bg-slate-50 px-3 py-2">
                <span>Son yanıt</span>
                <span className="font-semibold">{rfq.response_due_date ?? "-"}</span>
              </div>
              <div className="flex justify-between rounded-lg border border-black/10 bg-slate-50 px-3 py-2">
                <span>Oluşturma</span>
                <span className="font-semibold">{new Date(rfq.created_at).toLocaleString("tr-TR")}</span>
              </div>
            </div>
            {canEditPage ? (
              <RfqSupplierAdder
                rfqId={rfq.id}
                suppliers={availableSuppliers.map((row: any) => ({
                  id: String(row.id),
                  name: row.name ?? String(row.id),
                }))}
              />
            ) : null}
            <SupplierQuoteList
              rfqId={rfq.id}
              readOnly={!canEditPage}
              suppliers={(rfq.rfq_suppliers ?? []).map((row: any) => ({
                id: row.supplier_id,
                name: row.suppliers?.name ?? row.supplier_id ?? "-",
                hasQuote: (rfq.rfq_quotes ?? []).some((q: any) => q.supplier_id === row.supplier_id),
                isSelected: (rfq as any).selected_supplier_id === row.supplier_id,
                quoteId: (rfq as any).selected_quote_id,
              }))}
            />
          </div>
        </details>

        <details className="group rounded-lg border border-black/10 bg-white p-3 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-black/40">Dosyalar</p>
              <h3 className="mt-1 text-sm font-semibold text-black">Belgeler</h3>
            </div>
            <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-black/55">
              {documents?.length ?? 0} belge
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-black/10 pt-3">
            <ul className="max-h-[320px] space-y-2 overflow-auto text-sm text-black/70">
              {(documents ?? []).map((doc: any) => (
                <li key={doc.id} className="flex items-center justify-between rounded-lg border border-black/10 bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate">{doc.file_name}</div>
                    <div className="text-[11px] text-black/50">{doc.uploaded_at?.slice(0, 10) ?? ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.storage_path ? <DocumentDownloadButton storagePath={doc.storage_path} label="Gor" /> : null}
                    {canEditPage ? (
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
                    ) : null}
                  </div>
                </li>
              ))}
              {!documents?.length ? <li className="text-black/40">Henüz belge yok</li> : null}
            </ul>
            <div>
              {canEditPage && proformaDocType ? (
                <DocumentUploader
                  rfqId={rfq.id}
                  documentTypes={[{ id: proformaDocType.id, name: proformaDocType.name }]}
                />
              ) : (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  {proformaDocType
                    ? "Belge yukleme yalnizca admin rolu icin aciktir."
                    : "Proforma belge tipi bulunamadi. `document_types` tablosunda `Proforma` kaydi gerekli."}
                </div>
              )}
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

