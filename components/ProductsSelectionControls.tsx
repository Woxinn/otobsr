"use client";

import { useCallback, useEffect, useState } from "react";

type ProductsSelectionControlsProps = {
  formId: string;
  exportHref?: string;
};

const getCheckboxes = (formId: string) =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[name="product_ids"][form="${formId}"]`
    )
  );

export default function ProductsSelectionControls({
  formId,
  exportHref = "/api/products/export",
}: ProductsSelectionControlsProps) {
  const [selectedCount, setSelectedCount] = useState(0);
  const [isAllSelected, setIsAllSelected] = useState(false);

  const refreshState = useCallback(() => {
    const checkboxes = getCheckboxes(formId);
    const count = checkboxes.filter((item) => item.checked).length;
    setSelectedCount(count);
    setIsAllSelected(checkboxes.length > 0 && count === checkboxes.length);
  }, [formId]);

  useEffect(() => {
    refreshState();
    const checkboxes = getCheckboxes(formId);
    const handler = () => refreshState();
    checkboxes.forEach((checkbox) => checkbox.addEventListener("change", handler));

    return () => {
      checkboxes.forEach((checkbox) =>
        checkbox.removeEventListener("change", handler)
      );
    };
  }, [formId, refreshState]);

  const toggleAll = useCallback(
    (checked: boolean) => {
      const checkboxes = getCheckboxes(formId);
      checkboxes.forEach((checkbox) => {
        checkbox.checked = checked;
      });
      setSelectedCount(checked ? checkboxes.length : 0);
      setIsAllSelected(checked && checkboxes.length > 0);
    },
    [formId]
  );

  const exportSelected = useCallback(() => {
    const ids = getCheckboxes(formId)
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value)
      .filter(Boolean);

    if (!ids.length) return;

    const params = new URLSearchParams({ ids: ids.join(",") });
    window.location.href = `${exportHref}?${params.toString()}`;
  }, [exportHref, formId]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-4 text-xs text-black/60">
      <label className="inline-flex items-center gap-2 text-xs font-semibold text-black/70">
        <input
          type="checkbox"
          checked={isAllSelected}
          onChange={(event) => toggleAll(event.target.checked)}
          className="h-4 w-4 rounded border-black/20 text-[var(--ocean)]"
        />
        Tumunu sec
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/70">
          Seçili: {selectedCount}
        </span>
        <button
          type="button"
          onClick={exportSelected}
          disabled={selectedCount === 0}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:-translate-y-0.5 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-white disabled:text-black/30 disabled:hover:translate-y-0"
        >
          Seçiliyi Excel aktar
        </button>
      </div>
    </div>
  );
}

