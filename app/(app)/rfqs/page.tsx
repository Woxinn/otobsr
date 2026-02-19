import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";
import RfqDeleteButton from "@/components/RfqDeleteButton";

export default async function RfqListPage() {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) {
    return <div className="p-6 text-sm text-red-600">Erişim yok.</div>;
  }

  const { data: rfqs } = await supabase
    .from("rfqs")
    .select(
      "id, code, title, status, response_due_date, created_at, currency, incoterm, target_suppliers, rfq_items(count)"
    )
    .order("created_at", { ascending: false });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">RFQ</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">RFQ Listesi</h1>
        </div>
        <Link
          href="/siparis-plani"
          className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70"
        >
          Sipariş Planına Dön
        </Link>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.28em] text-black/50">
            <tr>
              <th className="px-3 py-2">Kod</th>
              <th className="px-3 py-2">Başlık</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Ürün</th>
              <th className="px-3 py-2">Tedarikçi</th>
              <th className="px-3 py-2">Para/Incoterm</th>
              <th className="px-3 py-2">Son Yanıt</th>
              <th className="px-3 py-2">Oluşturma</th>
              {role !== "Satis" ? <th className="px-3 py-2 text-right">Aksiyon</th> : null}
            </tr>
          </thead>
          <tbody className="align-top">
            {(rfqs ?? []).map((rfq) => (
              <tr key={rfq.id} className="border-b border-black/5 last:border-none hover:bg-[var(--sand)]/20">
                <td className="px-3 py-3 font-semibold text-[var(--ocean)]">
                  <Link href={`/rfqs/${rfq.id}`}>{rfq.code}</Link>
                </td>
                <td className="px-3 py-3">{rfq.title ?? "-"}</td>
                <td className="px-3 py-3 capitalize">{rfq.status}</td>
                <td className="px-3 py-3">{rfq.rfq_items?.[0]?.count ?? 0}</td>
                <td className="px-3 py-3">{Array.isArray(rfq.target_suppliers) ? rfq.target_suppliers.length : 0}</td>
                <td className="px-3 py-3 text-black/70">
                  {rfq.currency ?? "-"} / {rfq.incoterm ?? "-"}
                </td>
                <td className="px-3 py-3 text-black/70">
                  {rfq.response_due_date ?? "-"}
                </td>
                <td className="px-3 py-3 text-black/70">
                  {new Date(rfq.created_at).toLocaleString("tr-TR")}
                </td>
                {role !== "Satis" ? (
                  <td className="px-3 py-3 text-right">
                    <RfqDeleteButton rfqId={rfq.id} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
