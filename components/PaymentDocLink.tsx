"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function PaymentDocLink({
  storagePath,
  fileName,
}: {
  storagePath: string;
  fileName?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDoc = async () => {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error: err } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 5);
    setLoading(false);
    if (err || !data?.signedUrl) {
      setError("Belge açilamadi");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="flex flex-col items-end gap-1 text-[11px]">
      <button
        type="button"
        onClick={openDoc}
        disabled={loading}
        className="rounded-lg border border-black/15 bg-white px-2 py-1 text-[11px] font-semibold text-black hover:bg-[var(--mint)]/40 disabled:opacity-50"
      >
        {loading ? "Açiliyor..." : "Gör"}
      </button>
      {fileName ? <span className="text-[10px] text-black/50">{fileName}</span> : null}
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </div>
  );
}
