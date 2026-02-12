"use client";

import { useMemo, useState } from "react";

type ProductGroup = {
  id: string;
  name: string;
};

type ProductAttribute = {
  id: string;
  group_id: string;
  name: string;
  unit: string | null;
  value_type: string;
  is_required: boolean | null;
  sort_order: number | null;
};

type ProductValue = {
  attribute_id: string;
  value_text: string | null;
  value_number: number | null;
};

type ExtraAttribute = {
  id?: string;
  name: string;
  unit: string;
  value_type: "number" | "text";
  value: string;
};

type ProductRecord = {
  id: string;
  code: string | null;
  name: string | null;
  unit_price: number | null;
  brand: string | null;
  description: string | null;
  notes: string | null;
  group_id: string | null;
  gtip_id?: string | null;
  domestic_cost_percent?: number | null;
};

type ProductFormProps = {
  mode: "create" | "edit";
  groups: ProductGroup[];
  attributes: ProductAttribute[];
  values?: ProductValue[];
  extraAttributes?: ExtraAttribute[];
  product?: ProductRecord;
  action: (formData: FormData) => void | Promise<void>;
  gtips?: { id: string; code: string; description?: string | null }[];
};

export default function ProductForm({
  mode,
  groups,
  attributes,
  values,
  extraAttributes,
  product,
  action,
  gtips = [],
}: ProductFormProps) {
  const [selectedGroupId, setSelectedGroupId] = useState(
    product?.group_id ?? ""
  );
  const [extras, setExtras] = useState<ExtraAttribute[]>(
    extraAttributes?.length
      ? extraAttributes
      : [
          {
            name: "",
            unit: "",
            value_type: "text",
            value: "",
          },
        ]
  );

  const gtipOptions = gtips
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));

  const filteredAttributes = useMemo(() => {
    return attributes
      .filter((attr) => attr.group_id === selectedGroupId)
      .sort((a, b) => {
        const orderA = a.sort_order ?? 0;
        const orderB = b.sort_order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
  }, [attributes, selectedGroupId]);

  const valueByAttribute = useMemo(() => {
    return new Map((values ?? []).map((value) => [value.attribute_id, value]));
  }, [values]);

  const updateExtra = (
    index: number,
    updates: Partial<ExtraAttribute>
  ) => {
    setExtras((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...updates } : item))
    );
  };

  const addExtra = () => {
    setExtras((prev) => [
      ...prev,
      { name: "", unit: "", value_type: "text", value: "" },
    ]);
  };

  const removeExtra = (index: number) => {
    setExtras((prev) => prev.filter((_, idx) => idx !== index));
  };

  return (
    <form
      action={action}
      className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
    >
      {mode === "edit" && product ? (
        <input type="hidden" name="id" value={product.id} />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-medium lg:col-span-2">
          Kategori
          <select
            name="group_id"
            value={selectedGroupId}
            onChange={(event) => setSelectedGroupId(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          >
            <option value="">Kategori seciniz</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs text-black/50">
            Kategori secilince nitelikler otomatik yuklenir.
          </span>
        </label>
        <label className="text-sm font-medium">
          Ürün kodu
          <input
            name="code"
            defaultValue={product?.code ?? ""}
            placeholder="BIZ-001"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Ürün adi
          <input
            name="name"
            defaultValue={product?.name ?? ""}
            placeholder="Standart urun adi"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Marka
          <input
            name="brand"
            defaultValue={product?.brand ?? ""}
            placeholder="Ornek marka"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          GTIP
          <select
            name="gtip_id"
            defaultValue={product?.gtip_id ?? ""}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          >
            <option value="">GTIP seciniz</option>
            {gtipOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} {g.description ? `- ${g.description}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Yurtici masraf (%)
          <input
            name="domestic_cost_percent"
            type="number"
            step="0.01"
            defaultValue={product?.domestic_cost_percent ?? ""}
            placeholder="0"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Birim fiyat
          <input
            name="unit_price"
            defaultValue={product?.unit_price ?? ""}
            placeholder="USD"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium lg:col-span-2">
          Aciklama
          <input
            name="description"
            defaultValue={product?.description ?? ""}
            placeholder="Ürün aciklamasi"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium lg:col-span-2">
          Not
          <input
            name="notes"
            defaultValue={product?.notes ?? ""}
            placeholder="Not"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold">Nitelikler</p>
        {filteredAttributes.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {filteredAttributes.map((attr) => {
              const value = valueByAttribute.get(attr.id);
              const defaultValue =
                attr.value_type === "number"
                  ? value?.value_number ?? ""
                  : value?.value_text ?? "";
              return (
                <label key={attr.id} className="text-xs font-medium">
                  {attr.name}
                  {attr.unit ? ` (${attr.unit})` : ""}
                  {attr.is_required ? " *" : ""}
                  <input
                    type={attr.value_type === "number" ? "number" : "text"}
                    step={attr.value_type === "number" ? "0.01" : undefined}
                    name={`attr_${attr.id}`}
                    defaultValue={defaultValue ?? ""}
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                </label>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-black/10 bg-[var(--sand)] px-4 py-3 text-sm text-black/70">
            Kategori secilmedi veya kategori icin nitelik tanimlanmadi.
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-black/10 bg-[var(--sand)]/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">Ek nitelikler</p>
          <button
            type="button"
            onClick={addExtra}
            className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold"
          >
            + Nitelik ekle
          </button>
        </div>
        <div className="mt-3 grid gap-3">
          {extras.map((extra, index) => (
            <div
              key={`extra-${index}`}
              className="grid gap-3 rounded-2xl border border-black/10 bg-white p-3 text-xs lg:grid-cols-5"
            >
              <input
                type="hidden"
                name={`extra_id_${index}`}
                value={extra.id ?? ""}
              />
              <input
                name={`extra_name_${index}`}
                value={extra.name}
                onChange={(event) => updateExtra(index, { name: event.target.value })}
                placeholder="Nitelik adi"
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm lg:col-span-2"
              />
              <input
                name={`extra_unit_${index}`}
                value={extra.unit}
                onChange={(event) => updateExtra(index, { unit: event.target.value })}
                placeholder="Birim"
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
              <select
                name={`extra_type_${index}`}
                value={extra.value_type}
                onChange={(event) =>
                  updateExtra(index, {
                    value_type: event.target.value as ExtraAttribute["value_type"],
                  })
                }
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
              >
                <option value="text">Metin</option>
                <option value="number">Sayisal</option>
              </select>
              <div className="flex items-center gap-2">
                <input
                  name={`extra_value_${index}`}
                  type={extra.value_type === "number" ? "number" : "text"}
                  step={extra.value_type === "number" ? "0.01" : undefined}
                  value={extra.value}
                  onChange={(event) =>
                    updateExtra(index, { value: event.target.value })
                  }
                  placeholder="Deger"
                  className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
                {extras.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeExtra(index)}
                    className="rounded-full border border-black/20 px-3 py-2 text-xs font-semibold text-black/60"
                  >
                    Sil
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-black/50">
          Ek nitelikler sadece bu urun icin saklanir.
        </p>
      </div>

      <button className="mt-6 rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
        {mode === "edit" ? "Kaydet" : "Ürün olustur"}
      </button>
    </form>
  );
}

