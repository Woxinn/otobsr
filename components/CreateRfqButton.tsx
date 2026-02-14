"use client";

import { useState } from "react";

type Props = {
  disabled?: boolean;
};

export default function CreateRfqButton({ disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleCreate = async () => {
    // yalnızca modal için uyarı
    setMessage("Detaylı RFQ oluşturmak için alttaki modalı kullanın.");
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleCreate}
        disabled={disabled || loading}
        className={`rounded-2xl px-4 py-2 text-sm font-semibold text-white transition ${
          disabled || loading
            ? "cursor-not-allowed bg-black/30"
            : "bg-[var(--ocean)] hover:-translate-y-0.5 shadow-sm"
        }`}
      >
        {loading ? "Oluşturuluyor..." : "Seçilenlerle RFQ oluştur"}
      </button>
      {message ? <span className="text-xs text-red-600">{message}</span> : null}
    </div>
  );
}
