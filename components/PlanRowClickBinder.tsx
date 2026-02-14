"use client";

import { useEffect } from "react";

export default function PlanRowClickBinder() {
  useEffect(() => {
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      // skip if clicked directly on input/label
      if (target.closest("input")) return;
      const row = target.closest<HTMLElement>('[data-plan-row="1"]');
      if (!row) return;
      const cb = row.querySelector<HTMLInputElement>('input[name="plan_select"]');
      if (cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return null;
}
