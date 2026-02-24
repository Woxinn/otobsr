import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canEdit, canViewModule, getCurrentUserRole } from "@/lib/roles";
import ProformaDeleteButton from "@/components/ProformaDeleteButton";

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
    return <div className="p-6 text-sm text-red-600">Erisim yok.</div>;
  }

  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");
  const { data: proformas, error } = await supabase
    .from("proformas")
    .select("id, proforma_no, name, proforma_date, currency, total_amount, supplier_id, suppliers(name), created_at")
    .order("created_at", { ascending: false });
  if (error) return <div className="p-6 text-sm text-red-600">Liste okunamadi: {error.message}</div>;

  const query = (resolved.q ?? "").trim().toLowerCase();
  const supplier = (resolved.supplier ?? "").trim();
  const filtered = (proformas ?? []).filter((p) => {
    if (supplier && p.supplier_id !== supplier) return false;
    if (!query) return true;
    const supplierName = Array.isArray(p.suppliers) ? p.suppliers[0]?.name : (p.suppliers as any)?.name;
    const haystack = [p.proforma_no ?? "", p.name ?? "", supplierName ?? ""].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">Proforma Modulu</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">Proformalar</h1>
        </div>
        <Link
          href="/proformalar/new"
          className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
        >
          Yeni Proforma
        </Link>
      </div>

      <form className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-sm font-medium text-black/70">
            Arama
            <input
              name="q"
              defaultValue={resolved.q ?? ""}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
              placeholder="Proforma no, proforma adi, tedarikci"
            />
          </label>
          <label className="text-sm font-medium text-black/70">
            Tedarikci
            <select
              name="supplier"
              defaultValue={resolved.supplier ?? ""}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              {(suppliers ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
              Filtrele
            </button>
            <Link
              href="/proformalar"
              className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold text-black/70"
            >
              Temizle
            </Link>
          </div>
        </div>
      </form>

      <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-[11px] uppercase tracking-[0.24em] text-black/50">
                <th className="w-[14%] px-3 py-3">Proforma</th>
                <th className="w-[20%] px-3 py-3">Proforma adi</th>
                <th className="w-[20%] px-3 py-3">Tedarikci</th>
                <th className="w-[10%] px-3 py-3">Tarih</th>
                <th className="w-[12%] px-3 py-3 text-right">Toplam</th>
                <th className="w-[10%] px-3 py-3">Para Birimi</th>
                {allowDelete ? <th className="w-[10%] px-3 py-3 text-right">Islem</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const supplierName = Array.isArray(p.suppliers) ? p.suppliers[0]?.name : (p.suppliers as any)?.name;
                return (
                  <tr key={p.id} className="border-b border-black/5 hover:bg-black/5">
                    <td className="px-3 py-3 font-semibold">
                      <Link href={`/proformalar/${p.id}`} className="text-[var(--ocean)] hover:underline">
                        {p.proforma_no}
                      </Link>
                    </td>
                    <td className="px-3 py-3 break-words">{p.name ?? "-"}</td>
                    <td className="px-3 py-3 break-words">{supplierName ?? "-"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{fmtDate(p.proforma_date)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{fmtMoney(p.total_amount)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{p.currency ?? "-"}</td>
                    {allowDelete ? (
                      <td className="px-3 py-3 text-right">
                        <ProformaDeleteButton proformaId={p.id} compact />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <div className="py-8 text-center text-sm text-black/60">Kayit yok.</div> : null}
      </div>
    </section>
  );
}
