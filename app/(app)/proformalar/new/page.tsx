import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";
import ProformaImportForm from "@/components/ProformaImportForm";

export default async function NewProformaPage() {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "proformas")) {
    return <div className="p-6 text-sm text-red-600">Erisim yok.</div>;
  }

  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">Proforma Modulu</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">Yeni Proforma Import</h1>
        </div>
        <Link
          href="/proformalar"
          className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70"
        >
          Listeye don
        </Link>
      </div>
      <ProformaImportForm suppliers={(suppliers ?? []) as { id: string; name: string }[]} />
    </section>
  );
}
