"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function DocumentDownloadButton({
  storagePath,
  label = "Ac",
}: {
  storagePath: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, 60);
    setLoading(false);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  return (
    <button
      onClick={handleOpen}
      disabled={loading}
      className="rounded-full border border-black/20 px-3 py-1 text-xs"
    >
      {loading ? "Aciliyor..." : label}
    </button>
  );
}
