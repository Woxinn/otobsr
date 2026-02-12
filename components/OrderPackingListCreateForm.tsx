"use client";

import { useMemo, useState } from "react";

type PackingProductOption = {
  id: string;
  code: string | null;
  name: string | null;
};

type OrderPackingListCreateFormProps = {
  orderId: string;
  products: PackingProductOption[];
  action: (formData: FormData) => void | Promise<void>;
};

export default function OrderPackingListCreateForm({
  orderId,
  products,
  action,
}: OrderPackingListCreateFormProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [description, setDescription] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) return products;
    return products.filter((product) => {
      const haystack = `${product.code ?? ""} ${product.name ?? ""}`.toLowerCase();
      return haystack.includes(lowered);
    });
  }, [products, query]);

  const handleSelect = (product: PackingProductOption) => {
    setSelectedId(product.id);
    setQuery(`${product.code ?? "-"} - ${product.name ?? "-"}`);
    setDescription(product.name ?? "");
    setIsOpen(false);
  };

  return (
    <form
      action={action}
      className="rounded-2xl border border-dashed border-black/10 bg-white p-4 text-sm"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="product_id" value={selectedId} />
      <p className="font-semibold">Manuel packing list satiri ekle</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-6">
        <label className="text-xs font-semibold text-black/60 lg:col-span-3">
          Ürün ara (siparise ekli urunler)
          <div className="relative mt-2">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsOpen(true);
                setSelectedId("");
                setDescription("");
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Ürün kodu veya adi ile ara"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
              autoComplete="off"
            />
            {isOpen && filtered.length ? (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-auto rounded-2xl border border-black/10 bg-white p-2 text-xs shadow-[0_12px_30px_-18px_rgba(15,61,62,0.6)]">
                {filtered.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => handleSelect(product)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--mint)]/60"
                  >
                    <span className="font-semibold text-black">
                      {product.code ?? "-"}
                    </span>
                    <span className="truncate text-black/70">
                      {product.name ?? "-"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </label>
        <label className="text-xs font-semibold text-black/60 lg:col-span-3">
          Aciklama
          <input
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="DESCRIPTION"
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        <input
          name="ctn_no"
          placeholder="CTN NO."
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <input
          name="packages"
          placeholder="NO. OF CTN"
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <input
          name="quantity"
          placeholder="QTY (PC)"
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <input
          name="net_weight_kg"
          placeholder="N.W. (KG)"
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <input
          name="gross_weight_kg"
          placeholder="G.W. (KG)"
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
      </div>
      <button className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
        Packing list satiri ekle
      </button>
    </form>
  );
}

