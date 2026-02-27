"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Product = { id: string; code: string; name: string | null };
type Supplier = { id: string; name: string };
type Gtip = { id: string; code: string };

type Props = {
  products: Product[];
  suppliers: Supplier[];
  gtips: Gtip[];
};

const currencyOptions = ["USD", "EUR", "TRY"] as const;
const incotermOptions = ["EXW", "FOB", "CFR", "CIF", "DAP", "DDP"] as const;

type FormState = {
  title: string;
  notes: string;
  due: string;
  currency: string;
  incoterm: string;
  supplierIds: string[];
};

type SearchResponse = {
  items: Product[];
  count: number;
};

export default function RfqCreateForm({ products, suppliers, gtips }: Props) {
  const [form, setForm] = useState<FormState>({
    title: "",
    notes: "",
    due: "",
    currency: "USD",
    incoterm: "FOB",
    supplierIds: [],
  });
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [remote, setRemote] = useState<Product[]>(products);
  const [remoteCount, setRemoteCount] = useState<number>(products.length);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [csvText, setCsvText] = useState("code,qty\n");
  const [gtipFilter, setGtipFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [quantityById, setQuantityById] = useState<Record<string, number>>({});

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return remote;
    return remote.filter((p) => {
      const code = p.code?.toLowerCase() ?? "";
      const name = p.name?.toLowerCase() ?? "";
      return code.includes(term) || name.includes(term);
    });
  }, [filter, remote]);

  const productLookup = useMemo(() => {
    const map = new Map<string, Product>();
    [...products, ...remote].forEach((p) => map.set(p.id, p));
    return map;
  }, [products, remote]);

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(id);
      if (exists) return prev.filter((x) => x !== id);
      setQuantityById((q) => ({ ...q, [id]: q[id] ?? 1 }));
      return [...prev, id];
    });
  };

  const toggleSelectFiltered = () => {
    setSelectedIds((prev) => {
      const filteredIds = filtered.map((p) => p.id);
      const allSelected = filteredIds.every((id) => prev.includes(id)) && filteredIds.length > 0;
      if (allSelected) {
        return prev.filter((id) => !filteredIds.includes(id));
      }
      const next = new Set(prev);
      filteredIds.forEach((id) => next.add(id));
      // varsayılan qty 1
      setQuantityById((q) => {
        const copy = { ...q };
        filteredIds.forEach((id) => {
          if (copy[id] === undefined) copy[id] = 1;
        });
        return copy;
      });
      return Array.from(next);
    });
  };

  const updateQty = (id: string, raw: string) => {
    const num = Number(raw);
    setQuantityById((prev) => ({ ...prev, [id]: Number.isFinite(num) && num > 0 ? num : 1 }));
  };

  const toggleSupplier = (id: string) => {
    setForm((prev) => {
      const exists = prev.supplierIds.includes(id);
      return {
        ...prev,
        supplierIds: exists ? prev.supplierIds.filter((x) => x !== id) : [...prev.supplierIds, id],
      };
    });
  };

  const runSearch = async (
    term: string,
    nextPage = page,
    nextPerPage = perPage,
    nextGtip = gtipFilter
  ): Promise<Product[]> => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(nextPerPage));
      params.set("offset", String((nextPage - 1) * nextPerPage));
      if (nextGtip) params.set("gtip", nextGtip);
      if (term.trim().length >= 2) params.set("q", term.trim());
      const res = await fetch(`/api/products/search?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as SearchResponse;
      setRemote(data.items ?? []);
      setRemoteCount(data.count ?? data.items?.length ?? 0);
      return data.items ?? [];
    } catch (err) {
      console.error("[product-search]", err);
      setMessage("Ürün aramada hata");
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      runSearch(filter, 1, perPage, gtipFilter);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filter]);

  useEffect(() => {
    runSearch(filter, page, perPage, gtipFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, gtipFilter]);

  const handleCsvAdd = async () => {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed: { code: string; qty: number }[] = [];
    lines.forEach((line) => {
      const [codeRaw, qtyRaw] = line.split(/[;,\t ]+/);
      const code = (codeRaw ?? "").trim();
      const qty = Number(qtyRaw ?? "1");
      if (code) parsed.push({ code, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 });
    });
    if (!parsed.length) {
      setMessage("CSV boş");
      return;
    }
    const codesJoined = parsed.map((p) => p.code).join(" ");
    const csvLimit = Math.min(200, Math.max(perPage, parsed.length));
    const results = await runSearch(codesJoined, 1, csvLimit, gtipFilter);
    const codeMap = new Map<string, Product>();
    results.forEach((p) => codeMap.set((p.code ?? "").toLowerCase(), p));

    const newIds: string[] = [];
    const newQty: Record<string, number> = {};
    parsed.forEach(({ code, qty }) => {
      const match = codeMap.get(code.toLowerCase());
      if (match) {
        newIds.push(match.id);
        newQty[match.id] = qty;
      }
    });
    if (!newIds.length) {
      setMessage("CSV kodları bulunamadı");
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...newIds])));
    setQuantityById((prev) => ({ ...prev, ...newQty }));
  };

  const totalPages = Math.max(1, Math.ceil(remoteCount / perPage));

  const handleSubmit = async () => {
    if (loading) return;
    if (!selectedIds.length) {
      setMessage("Ürün seçin");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const itemsPayload = selectedIds.map((id) => ({
        product_id: id,
        quantity: quantityById[id] ?? 1,
      }));
      const payload = {
        product_ids: selectedIds, // backward compat
        items: itemsPayload,
        title: form.title,
        notes: form.notes,
        response_due_date: form.due || null,
        currency: form.currency || null,
        incoterm: form.incoterm || null,
        supplier_ids: form.supplierIds,
      };
      const res = await fetch("/api/rfq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        /* ignore parse */
      }
      if (!res.ok) {
        const errorMsg =
          typeof data === "object" && data && "error" in data ? (data as { error?: string }).error : null;
        setMessage(errorMsg ?? text ?? "RFQ oluşturulamadı");
      } else if (data && typeof data === "object" && "id" in data) {
        const id = (data as { id?: string }).id;
        if (id) {
          window.location.href = `/rfqs/${id}`;
        } else {
          setMessage("Beklenmeyen yanıt");
        }
      } else {
        setMessage("Beklenmeyen yanıt");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`Sunucu hatası: ${msg}`);
      console.error("[rfq-create-page]", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-black/70">
          Başlık
          <input
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          />
        </label>
        <label className="text-sm text-black/70">
          Son yanıt tarihi
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            value={form.due}
            onChange={(e) => setForm((p) => ({ ...p, due: e.target.value }))}
          />
        </label>
        <label className="text-sm text-black/70">
          Para birimi
          <select
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            value={form.currency}
            onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
          >
            {currencyOptions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-black/70">
          Incoterm
          <select
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            value={form.incoterm}
            onChange={(e) => setForm((p) => ({ ...p, incoterm: e.target.value }))}
          >
            {incotermOptions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2 text-sm text-black/70">
          Notlar
          <textarea
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/50">Ürünler</p>
            <p className="text-xs text-black/60">
              Plan dışı serbest seçim — {remoteCount} kayıt
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Kod veya isim ara (min 2 karakter uzakta remote arar)"
              className="w-72 rounded-xl border border-black/15 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={toggleSelectFiltered}
              className="rounded-full border border-black/15 px-3 py-2 text-xs font-semibold text-black/70"
            >
              {filtered.every((p) => selectedIds.includes(p.id)) && filtered.length > 0
                ? "Filtreleneni bırak"
                : "Filtreleneni seç"}
            </button>
            {isSearching ? <span className="text-xs text-black/60">Aranıyor...</span> : null}
            <select
              className="rounded-xl border border-black/15 px-3 py-2 text-sm"
              value={gtipFilter}
              onChange={(e) => {
                setPage(1);
                setGtipFilter(e.target.value);
              }}
            >
              <option value="">GTIP: Hepsi</option>
              <option value="none">GTIP yok</option>
              {gtips.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-black/15 px-3 py-2 text-sm"
              value={perPage}
              onChange={(e) => {
                setPage(1);
                setPerPage(Number(e.target.value));
              }}
            >
              {[50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}/sayfa
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 text-xs text-black/70">
              <button
                type="button"
                className="rounded-full border border-black/15 px-3 py-1 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ←
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="rounded-full border border-black/15 px-3 py-1 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                →
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2 max-h-72 overflow-y-auto rounded-2xl border border-black/10 bg-white">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-[11px] uppercase tracking-[0.25em] text-black/50">
                <tr>
                  <th className="px-3 py-2">
                    <span className="sr-only">Seç</span>
                  </th>
                  <th className="px-3 py-2">Kod</th>
                  <th className="px-3 py-2">İsim</th>
                  <th className="px-3 py-2 text-right">Adet</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const checked = selectedIds.includes(p.id);
                  return (
                    <tr key={p.id} className="border-b border-black/5 last:border-none hover:bg-[var(--sand)]/30">
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProduct(p.id)}
                          className="h-4 w-4 accent-[var(--ocean)]"
                        />
                      </td>
                      <td className="px-3 py-2 font-semibold text-[var(--ocean)]">{p.code}</td>
                      <td className="px-3 py-2 text-black/70">{p.name ?? "-"}</td>
                      <td className="px-3 py-2 text-right">
                        {checked ? (
                          <input
                            type="number"
                            min={1}
                            value={quantityById[p.id] ?? 1}
                            onChange={(e) => updateQty(p.id, e.target.value)}
                            className="w-20 rounded-lg border border-black/15 px-2 py-1 text-right text-sm"
                          />
                        ) : (
                          <span className="text-black/30">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-black/60" colSpan={3}>
                      Sonuç yok
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded-2xl border border-black/10 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/50">CSV/Clipboard</p>
            <textarea
              className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="code,qty"
            />
            <button
              type="button"
              onClick={handleCsvAdd}
              className="w-full rounded-full border border-black/15 px-3 py-2 text-xs font-semibold text-black/70"
            >
              Kodları ara ve seç
            </button>
          </div>
        </div>

        <p className="text-xs text-black/60">
          Seçili ürün: <strong>{selectedIds.length}</strong>
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/50">Hedef tedarikçiler</p>
        <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-black/10 p-3">
          {suppliers.map((s) => {
            const checked = form.supplierIds.includes(s.id);
            return (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                  checked ? "border-[var(--ocean)] bg-[var(--ocean)]/5" : "border-black/10"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--ocean)]"
                  checked={checked}
                  onChange={() => toggleSupplier(s.id)}
                />
                <span className="truncate">{s.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        {message ? <span className="text-xs text-red-600">{message}</span> : <span />}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
            loading ? "cursor-not-allowed bg-black/30" : "bg-[var(--ocean)] hover:-translate-y-0.5 shadow-sm"
          }`}
        >
          {loading ? "Gönderiliyor..." : "RFQ oluştur"}
        </button>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/50">
            Seçilen ürünler ({selectedIds.length})
          </p>
          <button
            type="button"
            className="rounded-full border border-black/15 px-3 py-1 text-xs text-black/70 disabled:opacity-50"
            onClick={() => {
              setSelectedIds([]);
              setQuantityById({});
            }}
            disabled={!selectedIds.length}
          >
            Temizle
          </button>
        </div>
        <div className="mt-2 max-h-60 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.25em] text-black/50">
              <tr>
                <th className="px-2 py-1">Kod</th>
                <th className="px-2 py-1">İsim</th>
                <th className="px-2 py-1 text-right">Adet</th>
                <th className="px-2 py-1 text-right">Sil</th>
              </tr>
            </thead>
            <tbody>
              {selectedIds.map((id) => {
                const p = productLookup.get(id);
                return (
                  <tr key={id} className="border-b border-black/5 last:border-none">
                    <td className="px-2 py-1 font-semibold text-[var(--ocean)]">{p?.code ?? id}</td>
                    <td className="px-2 py-1 text-black/70">{p?.name ?? "-"}</td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        min={1}
                        value={quantityById[id] ?? 1}
                        onChange={(e) => updateQty(id, e.target.value)}
                        className="w-20 rounded-lg border border-black/15 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        className="text-xs font-semibold text-red-600"
                        onClick={() => toggleProduct(id)}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!selectedIds.length ? (
                <tr>
                  <td className="px-2 py-2 text-sm text-black/60" colSpan={4}>
                    Seçim yok
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
