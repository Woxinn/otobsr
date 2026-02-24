import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ConfirmActionForm from "@/components/ConfirmActionForm";
import {
  createProductAttribute,
  deleteProductAttribute,
  updateProductGroup,
} from "@/app/actions/products";

export default async function ProductGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const supabase = await createSupabaseServerClient();

  const { data: group } = await supabase
    .from("product_groups")
    .select("*")
    .eq("id", resolvedParams.id)
    .single();

  if (!group) {
    notFound();
  }

  const { data: attributes } = await supabase
    .from("product_attributes")
    .select("*")
    .eq("group_id", group.id)
    .order("sort_order", { ascending: true })
    .order("name");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Ürün kategorisi
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            {group.name}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a
            href={`/api/product-groups/${group.id}/template`}
            className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold"
          >
            Template olustur
          </a>
          <Link
            href="/product-groups"
            className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold"
          >
            Kategorilere don
          </Link>
        </div>
      </div>

      <form
        action={updateProductGroup}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="id" value={group.id} />
        <p className="text-sm font-semibold">Kategori bilgileri</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <input
            name="name"
            defaultValue={group.name ?? ""}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <input
            name="notes"
            defaultValue={group.notes ?? ""}
            placeholder="Not"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm lg:col-span-2"
          />
          <input
            name="lead_time_days"
            type="number"
            min="0"
            placeholder="Lead time (gün)"
            defaultValue={group.lead_time_days ?? ""}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <input
            name="safety_days"
            type="number"
            min="0"
            placeholder="Safety (gün)"
            defaultValue={group.safety_days ?? ""}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </div>
        <button className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
          Güncelle
        </button>
      </form>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Nitelikler</h3>
          <span className="text-xs text-black/60">
            {attributes?.length ?? 0} nitelik
          </span>
        </div>

        <form
          action={createProductAttribute}
          className="mt-4 grid gap-3 rounded-2xl border border-dashed border-black/10 bg-white p-4 text-sm lg:grid-cols-6"
        >
          <input type="hidden" name="group_id" value={group.id} />
          <input
            name="name"
            placeholder="Nitelik adi"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm lg:col-span-2"
          />
          <input
            name="unit"
            placeholder="Olcu birimi (mm, kg)"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <select
            name="value_type"
            defaultValue="number"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
          >
            <option value="number">Sayisal</option>
            <option value="text">Metin</option>
          </select>
          <input
            name="sort_order"
            placeholder="Sira"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-black/60">
            <input type="checkbox" name="is_required" />
            Zorunlu
          </label>
          <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white lg:col-span-6 lg:justify-self-start">
            Nitelik ekle
          </button>
        </form>

        {attributes?.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40">
                  <th className="py-3">Nitelik</th>
                  <th className="py-3">Tip</th>
                  <th className="py-3">Birim</th>
                  <th className="py-3">Zorunlu</th>
                  <th className="py-3">Sira</th>
                  <th className="py-3 text-right">Islem</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {attributes.map((attr) => (
                  <tr
                    key={attr.id}
                    className="border-b border-black/5 transition hover:bg-[var(--mint)]/40"
                  >
                    <td className="py-4 font-semibold">{attr.name}</td>
                    <td className="py-4">{attr.value_type ?? "number"}</td>
                    <td className="py-4">{attr.unit ?? "-"}</td>
                    <td className="py-4">{attr.is_required ? "Evet" : "Hayir"}</td>
                    <td className="py-4">{attr.sort_order ?? 0}</td>
                      <td className="py-4 text-right">
                        <ConfirmActionForm
                          action={deleteProductAttribute}
                          confirmText="Nitelik silinsin mi?"
                          buttonText="Sil"
                          className="inline"
                        >
                          <input type="hidden" name="id" value={attr.id} />
                          <input type="hidden" name="group_id" value={group.id} />
                        </ConfirmActionForm>
                      </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
            Henüz nitelik yok.
          </div>
        )}
      </div>
    </section>
  );
}

