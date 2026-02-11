"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProductOption = {
  id: string;
  code: string | null;
  name: string | null;
  unit_price: number | null;
};

type OrderItemCreateFormProps = {
  orderId: string;
  products: ProductOption[];
  action: (formData: FormData) => void | Promise<void>;
};

export default function OrderItemCreateForm({
  orderId,
  products,
  action,
}: OrderItemCreateFormProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [remoteResults, setRemoteResults] = useState<ProductOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const lowered = query.trim().toLowerCase();
    if (!isOpen) return;
    if (!lowered) {
      setRemoteResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, unit_price")
        .or(`code.ilike.%${lowered}%,name.ilike.%${lowered}%`)
        .order("code")
        .limit(50)
        .abortSignal(controller.signal);
      if (!error && data) {
        setRemoteResults(data as ProductOption[]);
      }
      setIsLoading(false);
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, isOpen, supabase]);

  const fallbackFiltered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) return products;
    return products.filter((product) => {
      const haystack = `${product.code ?? ""} ${product.name ?? ""}`.toLowerCase();
      return haystack.includes(lowered);
    });
  }, [products, query]);

  const filtered = remoteResults.length || isLoading ? remoteResults : fallbackFiltered;

  const handleSelect = (product: ProductOption) => {
    setSelectedId(product.id);
    setSelectedCode(product.code ?? "");
    setQuery(`${product.code ?? "-"} - ${product.name ?? "-"}`);
    setUnitPrice(product.unit_price !== null ? String(product.unit_price) : "");
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  useEffect(() => {
    if (!isOpen) return;
    if (highlightIndex < 0) return;
    const node = itemRefs.current[highlightIndex];
    if (node && node.scrollIntoView) {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex, isOpen]);

  return (
    <form
      action={action}
      className="rounded-2xl border border-dashed border-black/10 bg-white p-4 text-sm"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="product_id" value={selectedId} />
      <input type="hidden" name="product_code" value={selectedCode} />
      <input type="hidden" name="product_search" value={query} />
      <p className="font-semibold">Yeni urun ekle</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <label className="text-xs font-semibold text-black/60 lg:col-span-2">
          Urun sec
          <div className="relative mt-2">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsOpen(true);
                setSelectedId("");
                setSelectedCode("");
                setUnitPrice("");
                setHighlightIndex(-1);
              }}
              onFocus={() => {
                setIsOpen(true);
                setHighlightIndex(filtered.length ? 0 : -1);
              }}
              onKeyDown={(event) => {
                if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                  setIsOpen(true);
                  setHighlightIndex(filtered.length ? 0 : -1);
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlightIndex((prev) => {
                    const next = prev + 1;
                    return next >= filtered.length ? filtered.length - 1 : next;
                  });
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlightIndex((prev) => {
                    const next = prev - 1;
                    return next < 0 ? 0 : next;
                  });
                } else if (event.key === "Enter") {
                  if (highlightIndex >= 0 && filtered[highlightIndex]) {
                    event.preventDefault();
                    handleSelect(filtered[highlightIndex]);
                  }
                } else if (event.key === "Escape") {
                  setIsOpen(false);
                  setHighlightIndex(-1);
                }
              }}
              placeholder="Urun kodu veya adi ile ara"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
              autoComplete="off"
            />
            {isOpen && (filtered.length || isLoading) ? (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-auto rounded-2xl border border-black/10 bg-white p-2 text-xs shadow-[0_12px_30px_-18px_rgba(15,61,62,0.6)]">
                {isLoading ? (
                  <div className="px-3 py-2 text-black/50">Aranıyor…</div>
                ) : (
                  filtered.map((product, index) => (
                    <button
                      type="button"
                      key={product.id}
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      onClick={() => handleSelect(product)}
                      onMouseEnter={() => setHighlightIndex(index)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--mint)]/60 ${
                        highlightIndex === index ? "bg-[var(--mint)]/60" : ""
                      }`}
                    >
                      <span className="font-semibold text-black">
                        {product.code ?? "-"}
                      </span>
                      <span className="truncate text-black/70">
                        {product.name ?? "-"}
                      </span>
                    </button>
                  ))
                )}
                {!isLoading && !filtered.length ? (
                  <div className="px-3 py-2 text-black/50">Sonuc yok</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </label>
        <input
          name="name"
          placeholder="Tedarikci urun adi"
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm lg:col-span-2"
        />
        <input
          name="quantity"
          placeholder="Adet"
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <input
          name="unit_price"
          value={unitPrice}
          onChange={(event) => setUnitPrice(event.target.value)}
          placeholder="Birim fiyat"
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <input
          name="net_weight_kg"
          placeholder="Net kg"
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <input
          name="gross_weight_kg"
          placeholder="Brut kg"
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <input
          name="notes"
          placeholder="Not"
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm lg:col-span-2"
        />
      </div>
      <button className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
        Urun ekle
      </button>
    </form>
  );
}

