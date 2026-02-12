"use client";

import { useMemo, useState } from "react";

type Attribute = {
  id: string;
  name: string;
  unit: string | null;
  value_type: "text" | "number";
};

type MissingRow = {
  code: string;
  name: string | null;
  group_id?: string | null;
  group_name?: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_amount: number | null;
  net_weight_kg: number | null;
  gross_weight_kg: number | null;
  notes: string | null;
  attributes: {
    name: string;
    unit: string | null;
    valueType: "text" | "number";
    rawValue: string;
  }[];
};

type GroupWithAttrs = {
  id: string;
  name: string;
  product_attributes: Attribute[] | null;
};

type Props = {
  row: MissingRow;
  index: number;
  groups: GroupWithAttrs[];
};

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131|\u0130/g, "i");

export default function MissingProductRow({ row, index, groups }: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(row.group_id ?? "");
  const [newGroupName, setNewGroupName] = useState<string>(row.group_name ?? "");

  const groupAttributes = useMemo(() => {
    const group = groups.find((g) => g.id === selectedGroupId);
    return group?.product_attributes ?? [];
  }, [groups, selectedGroupId]);

  const initialAttrMap = useMemo(() => {
    const map = new Map<string, { unit: string | null; rawValue: string; valueType: "text" | "number" }>();
    (row.attributes ?? []).forEach((attr) => {
      map.set(normalize(attr.name), {
        unit: attr.unit,
        rawValue: attr.rawValue,
        valueType: attr.valueType,
      });
    });
    return map;
  }, [row.attributes]);

  return (
    <div className="rounded-2xl border border-black/10 bg-[radial-gradient(circle_at_top_left,#fff,#f7f9fb)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          Kod: <span className="text-[var(--ocean)]">{row.code}</span>
        </div>
        <div className="text-xs text-black/60">Adet: {row.quantity ?? "-"}</div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <label className="text-xs font-semibold text-black/60">
          Ürün adi
          <input
            name={`row_${index}_name`}
            defaultValue={row.name ?? row.code}
            className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            placeholder="Ürün adi"
          />
        </label>
        <label className="text-xs font-semibold text-black/60">
          Kategori
          <select
            name={`row_${index}_group_id`}
            value={selectedGroupId}
            onChange={(e) => {
              setSelectedGroupId(e.target.value);
            }}
            className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
          >
            <option value="">Seciniz</option>
            {groups?.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <input
            name={`row_${index}_new_group`}
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Yeni kategori adi (opsiyonel)"
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-black/60">
          Birim fiyat
          <input
            name={`row_${index}_unit_price`}
            defaultValue={row.unit_price ?? ""}
            className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            placeholder="Birim fiyat"
          />
        </label>
        <label className="text-xs font-semibold text-black/60 lg:col-span-3">
          Not
          <input
            name={`row_${index}_notes`}
            defaultValue={row.notes ?? ""}
            className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            placeholder="Not"
          />
        </label>
      </div>

      {groupAttributes.length ? (
        <div className="mt-3 rounded-xl border border-dashed border-black/10 bg-white/70 p-3 text-xs">
          <p className="font-semibold text-black/70">Kategori nitelikleri</p>
          <div className="mt-2 grid gap-2">
            {groupAttributes.map((attr, catIndex) => {
              const matched = initialAttrMap.get(normalize(attr.name));
              return (
                <div key={attr.id} className="grid gap-2 lg:grid-cols-4">
                  <div className="lg:col-span-1">
                    <input
                      value={attr.name}
                      readOnly
                      className="w-full rounded-lg border border-black/10 bg-black/5 px-2 py-1 font-semibold"
                    />
                    <input type="hidden" name={`row_${index}_cat_attr_id_${catIndex}`} value={attr.id} />
                    <input type="hidden" name={`row_${index}_cat_attr_type_${catIndex}`} value={attr.value_type} />
                  </div>
                  <input
                    name={`row_${index}_cat_attr_value_${catIndex}`}
                    defaultValue={matched?.rawValue ?? ""}
                    className="rounded-lg border border-black/10 bg-white px-2 py-1"
                    placeholder="Deger"
                  />
                  <input
                    name={`row_${index}_cat_attr_unit_${catIndex}`}
                    defaultValue={matched?.unit ?? attr.unit ?? ""}
                    className="rounded-lg border border-black/10 bg-white px-2 py-1"
                    placeholder="Birim"
                  />
                  <input
                    value={attr.value_type}
                    readOnly
                    className="rounded-lg border border-black/10 bg-black/5 px-2 py-1"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {row.attributes?.length ? (
        <div className="mt-3 rounded-xl border border-dashed border-black/10 bg-white/70 p-3 text-xs">
          <p className="font-semibold text-black/70">Importtan gelen nitelikler</p>
          <div className="mt-2 grid gap-2">
            {row.attributes.map((attr, attrIndex) => (
              <div
                key={`${attr.name}-${attrIndex}`}
                className="grid gap-2 lg:grid-cols-4"
              >
                <div className="lg:col-span-1">
                  <input
                    value={attr.name}
                    readOnly
                    className="w-full rounded-lg border border-black/10 bg-black/5 px-2 py-1 font-semibold"
                  />
                </div>
                <input
                  name={`row_${index}_attr_${attrIndex}_value`}
                  defaultValue={attr.rawValue}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1"
                  placeholder="Deger"
                />
                <input
                  name={`row_${index}_attr_${attrIndex}_unit`}
                  defaultValue={attr.unit ?? ""}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1"
                  placeholder="Birim"
                />
                <input
                  value={attr.valueType}
                  readOnly
                  className="rounded-lg border border-black/10 bg-black/5 px-2 py-1"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-dashed border-black/10 bg-white/70 p-3 text-xs">
        <p className="font-semibold text-black/70">Yeni nitelik ekle (opsiyonel)</p>
        <div className="mt-2 grid gap-2">
          {[0, 1].map((extraIndex) => (
            <div
              key={extraIndex}
              className="grid gap-2 lg:grid-cols-4"
            >
              <input
                name={`row_${index}_extra_attr_name_${extraIndex}`}
                placeholder="Nitelik adi"
                className="rounded-lg border border-black/10 bg-white px-2 py-1"
              />
              <input
                name={`row_${index}_extra_attr_value_${extraIndex}`}
                placeholder="Deger"
                className="rounded-lg border border-black/10 bg-white px-2 py-1"
              />
              <input
                name={`row_${index}_extra_attr_unit_${extraIndex}`}
                placeholder="Birim"
                className="rounded-lg border border-black/10 bg-white px-2 py-1"
              />
              <select
                name={`row_${index}_extra_attr_type_${extraIndex}`}
                className="rounded-lg border border-black/10 bg-white px-2 py-1"
                defaultValue="text"
              >
                <option value="text">Metin</option>
                <option value="number">Sayi</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

