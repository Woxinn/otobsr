"use client";

import { useMemo, useState } from "react";
import { deleteProductGroup, deleteProductGroupsBulk } from "@/app/actions/products";
import Link from "next/link";

type Group = {
  id: string;
  name: string;
  notes: string | null;
};

type Props = {
  groups: Group[];
  productCount: Record<string, number>;
  attributeCount: Record<string, number>;
};

export default function ProductGroupTableClient({
  groups,
  productCount,
  attributeCount,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  const allSelected = useMemo(
    () => selected.length === groups.length && groups.length > 0,
    [selected, groups]
  );

  const toggleOne = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected([]);
    } else {
      setSelected(groups.map((g) => g.id));
    }
  };

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-black/70">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-black/30"
            checked={allSelected}
            onChange={toggleAll}
          />
          Tumunu sec ({selected.length}/{groups.length})
        </label>
        <form action={deleteProductGroupsBulk} className="inline-flex items-center gap-2">
          {selected.map((id) => (
            <input key={id} type="hidden" name="group_ids" value={id} />
          ))}
          <button
            type="submit"
            disabled={!selected.length}
            className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Secilenleri sil
          </button>
        </form>
      </div>
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40">
            <th className="py-3">Sec</th>
            <th className="py-3">Kategori</th>
            <th className="py-3">Ürün sayisi</th>
            <th className="py-3">Nitelik sayisi</th>
            <th className="py-3">Not</th>
            <th className="py-3 text-right">Islem</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {groups.map((group) => {
            const count = productCount[group.id] ?? 0;
            return (
              <tr
                key={group.id}
                className="border-b border-black/5 transition hover:bg-[var(--mint)]/40"
              >
                <td className="py-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-black/30"
                    checked={selected.includes(group.id)}
                    onChange={() => toggleOne(group.id)}
                  />
                </td>
                <td className="py-4 font-semibold">{group.name}</td>
                <td className="py-4">{count}</td>
                <td className="py-4">{attributeCount[group.id] ?? 0}</td>
                <td className="py-4 text-black/60">{group.notes ?? "-"}</td>
                <td className="py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/product-groups/${group.id}`}
                      className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold"
                    >
                      Detay
                    </Link>
                    <form action={deleteProductGroup} className="inline">
                      <input type="hidden" name="group_id" value={group.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={count > 0 ? "Bu kategoride urun var, silinemez." : "Kategoriyi sil"}
                        disabled={count > 0}
                      >
                        Sil
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

