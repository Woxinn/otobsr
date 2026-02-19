import Link from "next/link";
import { getCurrentUserRole } from "@/lib/roles";

export default async function DiscrepancyDisabledPage() {
  const { role } = await getCurrentUserRole();
  if (role === "Satis") {
    return <div className="p-6 text-sm text-red-600">Erisim yok.</div>;
  }

  return (
    <section className="space-y-4 rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
      <p className="text-xs uppercase tracking-[0.3em] text-black/40">Fark Takibi</p>
      <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">Bu modül devre dışı</h1>
      <p className="text-sm text-black/70">
        Fark takip akışı Proforma bazlı yeni yapıya taşındı. Devam etmek için Proformalar modülünü kullanın.
      </p>
      <div>
        <Link
          href="/proformalar"
          className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
        >
          Proformalara git
        </Link>
      </div>
    </section>
  );
}
