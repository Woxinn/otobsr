"use client";

import { useCallback, useEffect, useState } from "react";

type ProductsSelectionControlsProps = {
  formId: string;
};

const getCheckboxes = (formId: string) =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[name="product_ids"][form="${formId}"]`
    )
  );

export default function ProductsSelectionControls({
  formId,
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
      <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/70">
        Seçili: {selectedCount}
      </span>
    </div>
  );
}

