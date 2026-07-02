import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canEdit, canViewModule, getCurrentUserRole } from "@/lib/roles";
import ProformaDeleteButton from "@/components/ProformaDeleteButton";
import { Plus, Search, Building, Filter, FileSpreadsheet, RefreshCw, FileText } from "lucide-react";

type SearchParams = {
  q?: string;
  supplier?: string;
};

const fmtMoney = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("tr-TR");
};

export const metadata: Metadata = {
  title: "Proformalar",
};

export default async function ProformasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const allowDelete = canEdit(role);
  if (!canViewModule(role, "proformas")) {
    return <div className="p-6 text-sm text-red-600">Erişim yok.</div>;
  }

  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");
  const { data: proformas, error } = await supabase
    .from("proformas")
    .select("id, proforma_no, name, proforma_date, currency, total_amount, supplier_id, suppliers(name), created_at")
    .order("created_at", { ascending: false });
  if (error) return <div className="p-6 text-sm text-red-600">Liste okunamadı: {error.message}</div>;

  const query = (resolved.q ?? "").trim().toLowerCase();
  const supplier = (resolved.supplier ?? "").trim();
  const exportParams = new URLSearchParams();
  if (resolved.q?.trim()) exportParams.set("q", resolved.q.trim());
  if (resolved.supplier?.trim()) exportParams.set("supplier", resolved.supplier.trim());
  const exportHref = `/api/proformalar/export${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;
  const filtered = (proformas ?? []).filter((p) => {
    if (supplier && p.supplier_id !== supplier) return false;
    if (!query) return true;
    const supplierName = Array.isArray(p.suppliers) ? p.suppliers[0]?.name : (p.suppliers as any)?.name;
    const haystack = [p.proforma_no ?? "", p.name ?? "", supplierName ?? ""].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Proforma Modülü</p>
          <h1 className="text-2xl font-bold text-slate-900 [font-family:var(--font-display)]">Proformalar</h1>
        </div>
        <Link
          href="/proformalar/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#101817] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#182322] cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Yeni Proforma
        </Link>
      </div>

      <form className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4 items-end">
          <div className="space-y-1.5">
            <label htmlFor="q" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Arama Terimi
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                id="q"
                name="q"
                defaultValue={resolved.q ?? ""}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
                placeholder="Proforma no, adı, tedarikçi..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="supplier" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tedarikçi Filtresi
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Building className="h-4 w-4" />
              </span>
              <select
                id="supplier"
                name="supplier"
                defaultValue={resolved.supplier ?? ""}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200 appearance-none"
              >
                <option value="">Tüm Tedarikçiler</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 md:col-span-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 cursor-pointer"
            >
              <Filter className="h-3.5 w-3.5" />
              Filtrele
            </button>
            <Link
              href={exportHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel Export
            </Link>
            <Link
              href="/proformalar"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Temizle
            </Link>
          </div>
        </div>
      </form>

      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-indigo-600">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                <th className="px-4 py-3.5">Proforma No</th>
                <th className="px-4 py-3.5">Proforma Adı</th>
                <th className="px-4 py-3.5">Tedarikçi</th>
                <th className="px-4 py-3.5">Tarih</th>
                <th className="px-4 py-3.5 text-right">Toplam Tutar</th>
                <th className="px-4 py-3.5">Para Birimi</th>
                {allowDelete ? <th className="px-4 py-3.5 text-right">İşlem</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => {
                const supplierName = Array.isArray(p.suppliers) ? p.suppliers[0]?.name : (p.suppliers as any)?.name;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold">
                      <Link
                        href={`/proformalar/${p.id}`}
                        className="text-indigo-600 hover:text-indigo-900 transition-colors inline-flex items-center gap-1"
                      >
                        <FileText className="h-3.5 w-3.5 opacity-60" />
                        {p.proforma_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[250px] truncate" title={p.name ?? undefined}>
                      {p.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={supplierName ?? undefined}>
                      {supplierName ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(p.proforma_date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                      {fmtMoney(p.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                        {p.currency ?? "USD"}
                      </span>
                    </td>
                    {allowDelete ? (
                      <td className="px-4 py-3 text-right">
                        <ProformaDeleteButton proformaId={p.id} compact />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <FileText className="h-10 w-10 opacity-30 stroke-[1.5]" />
            <p className="mt-2 text-sm font-semibold">Kayıt bulunamadı.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

