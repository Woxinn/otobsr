"use client";

import React, { useTransition, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Search, Filter, Loader2 } from "lucide-react";

interface ProductFilterFormProps {
  resolvedParams: {
    q?: string;
    group?: string | string[];
    supplier?: string;
    gtip?: string;
    page?: string;
    perPage?: string;
    netsis?: string;
    deepSearch?: string;
  };
  suppliers: { id: string; name: string }[] | null;
  gtips: { id: string; code: string }[] | null;
  groupStats: { id: string; name: string; count: number }[];
  isSales: boolean;
}

export default function ProductFilterForm({
  resolvedParams,
  suppliers,
  gtips,
  groupStats,
  isSales,
}: ProductFilterFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() => {
    const groupParam = resolvedParams.group;
    if (Array.isArray(groupParam)) return groupParam;
    if (groupParam) return groupParam.split(",").filter(Boolean);
    return [];
  });

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  const activeFilterCount =
    (resolvedParams.q?.trim() ? 1 : 0) +
    selectedGroupIds.length +
    (!isSales && resolvedParams.supplier ? 1 : 0) +
    (resolvedParams.gtip ? 1 : 0) +
    (resolvedParams.netsis ? 1 : 0);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const q = (formData.get("q") as string)?.trim() || "";
    const supplier = (formData.get("supplier") as string) || "";
    const gtip = (formData.get("gtip") as string) || "";
    const netsis = (formData.get("netsis") as string) || "";
    const perPage = (formData.get("perPage") as string) || "";
    const deepSearch = formData.get("deepSearch") === "true" ? "true" : "";

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (selectedGroupIds.length) params.set("group", selectedGroupIds.join(","));
    if (!isSales && supplier) params.set("supplier", supplier);
    if (gtip) params.set("gtip", gtip);
    if (netsis) params.set("netsis", netsis);
    if (perPage) params.set("perPage", perPage);
    if (deepSearch) params.set("deepSearch", "true");
    
    // Reset page to 1 on filter submit
    params.set("page", "1");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const selectedGroupNames = selectedGroupIds
    .map((id) => groupStats.find((group) => group.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">
            Filtre Merkezi
          </p>
          <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)]">
            Hızlı arama ve daraltma
          </h2>
        </div>
        <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-black/60">
          {activeFilterCount ? `${activeFilterCount} aktif` : "Filtre yok"}
        </span>
      </div>

      <div className={`mt-4 grid gap-3 ${isSales ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
        <div className="flex flex-col gap-1 lg:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
            Arama
            <span className="mt-1 flex items-center gap-2 rounded-lg border border-black/10 bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-black/35" />
              <input
                name="q"
                defaultValue={resolvedParams.q ?? ""}
                placeholder="Ürün kodu, ad, marka..."
                className="w-full bg-transparent text-sm font-medium normal-case tracking-normal text-black outline-none placeholder:text-black/35"
              />
            </span>
          </label>
          <label className="mt-1 inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              name="deepSearch"
              value="true"
              defaultChecked={resolvedParams.deepSearch === "true"}
              className="h-4 w-4 rounded border-black/20 text-[#101817] focus:ring-[#101817]"
            />
            <span className="text-xs font-semibold text-black/60">
              Açıklamalarda ve Notlarda da Ara (Detaylı)
            </span>
          </label>
        </div>

        {!isSales ? (
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
            Tedarikçi
            <select
              name="supplier"
              defaultValue={resolvedParams.supplier ?? ""}
              className="mt-1 w-full rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-sm font-medium normal-case tracking-normal text-black outline-none"
            >
              <option value="">Hepsi</option>
              {suppliers?.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
          GTİP
          <select
            name="gtip"
            defaultValue={resolvedParams.gtip ?? ""}
            className="mt-1 w-full rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-sm font-medium normal-case tracking-normal text-black outline-none"
          >
            <option value="">Hepsi</option>
            <option value="none">GTİP yok</option>
            {gtips?.map((gtip) => (
              <option key={gtip.id} value={gtip.id}>
                {gtip.code}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
          Stok kodu
          <select
            name="netsis"
            defaultValue={resolvedParams.netsis ?? ""}
            className="mt-1 w-full rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-sm font-medium normal-case tracking-normal text-black outline-none"
          >
            <option value="">Hepsi</option>
            <option value="none">Stok kodu yok</option>
            <option value="exists">Stok kodu var</option>
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
          Sayfada
          <select
            name="perPage"
            defaultValue={resolvedParams.perPage ?? "20"}
            className="mt-1 w-full rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-sm font-medium normal-case tracking-normal text-black outline-none"
          >
            {[10, 20, 50, 100].map((option) => (
              <option key={option} value={option}>
                {option} ürün
              </option>
            ))}
          </select>
        </label>
      </div>

      <details
        className="mt-4 rounded-lg border border-black/10 bg-slate-50 p-3"
        open={selectedGroupIds.length > 0}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
            Kategori filtresi
          </span>
          <span className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] font-bold text-black/60">
            {selectedGroupIds.length ? `${selectedGroupIds.length} seçili` : "Hepsi"}
          </span>
        </summary>
        <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
          {groupStats.map((group) => {
            const isChecked = selectedGroupIds.includes(group.id);
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => handleGroupToggle(group.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition cursor-pointer select-none ${
                  isChecked
                    ? "border-[#101817] bg-[#101817] text-white"
                    : "border-black/10 bg-white text-black/65 hover:border-black/20"
                }`}
              >
                <span>{group.name}</span>
                <span
                  className={`rounded-md px-1.5 py-[1px] text-[10px] ${
                    isChecked ? "bg-white/15 text-white" : "bg-black/8 text-black/65"
                  }`}
                >
                  {group.count}
                </span>
              </button>
            );
          })}
        </div>
      </details>

      {activeFilterCount ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {resolvedParams.q?.trim() ? (
            <span className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black/60">
              Arama: {resolvedParams.q}
            </span>
          ) : null}
          {selectedGroupNames.map((name) => (
            <span key={name} className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black/60">
              {name}
            </span>
          ))}
          {resolvedParams.gtip ? (
            <span className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black/60">
              GTİP: {resolvedParams.gtip === "none" ? "yok" : "seçili"}
            </span>
          ) : null}
          {resolvedParams.netsis ? (
            <span className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black/60">
              Stok kodu: {resolvedParams.netsis === "none" ? "yok" : "var"}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-[#101817] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Filter className="h-4 w-4" />
          )}
          {isPending ? "Filtreleniyor..." : "Filtrele"}
        </button>
        <Link
          href="/products"
          className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/65 transition hover:-translate-y-0.5 hover:bg-slate-50"
        >
          Temizle
        </Link>
      </div>
    </form>
  );
}
