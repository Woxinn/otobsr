import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";
import ProformaImportForm from "@/components/ProformaImportForm";
import { ChevronLeft } from "lucide-react";

export default async function NewProformaPage() {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "proformas")) {
    return <div className="p-6 text-sm text-red-600">Erişim yok.</div>;
  }

  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            href="/proformalar"
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
            Proformalar Listesine Dön
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 [font-family:var(--font-display)]">
            Yeni Proforma İçe Aktarma
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Excel veya CSV dosyası yükleyerek sisteme yeni bir proforma faturası ekleyin.
          </p>
        </div>
      </div>
      <ProformaImportForm suppliers={(suppliers ?? []) as { id: string; name: string }[]} />
    </section>
  );
}
