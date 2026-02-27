import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";
import RfqCreateForm from "@/components/RfqCreateForm";

export default async function RfqNewPage() {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) {
    return <div className="p-6 text-sm text-red-600">Erişim yok.</div>;
  }

  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name");
  const { data: products } = await supabase
    .from("products")
    .select("id, code, name")
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: gtips } = await supabase.from("gtips").select("id, code").order("code");

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">RFQ</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">Yeni RFQ</h1>
          <p className="text-sm text-black/60">Sipariş planı dışında serbest ürün seçerek RFQ aç.</p>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <RfqCreateForm products={products ?? []} suppliers={suppliers ?? []} gtips={gtips ?? []} />
      </div>
    </section>
  );
}

