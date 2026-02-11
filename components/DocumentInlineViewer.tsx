"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  storagePath: string;
  fileName?: string | null;
  height?: string;
};

export default function DocumentInlineViewer({
  storagePath,
  fileName,
  height = "70vh",
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase.storage
        .from("documents")
        .createSignedUrl(storagePath, 60 * 5);
      if (!mounted) return;
      if (err || !data?.signedUrl) {
        setError("Dosya icin gecici baglanti olusturulamadi.");
      } else {
        setUrl(data.signedUrl);
      }
      setLoading(false);
    };
    run();
    return () => {
      mounted = false;
    };
  }, [storagePath]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/70">
        Dokuman yukleniyor...
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/70">
        {error ?? "Dokuman gosterilemedi."}{" "}
        <span className="text-black/60">Indirerek acmayi deneyin.</span>
      </div>
    );
  }

  const ext = (fileName ?? "").split(".").pop()?.toLowerCase();
  const isPdf = ext === "pdf";
  const officeUrl = !isPdf
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
      <div className="flex items-center justify-between bg-black/5 px-3 py-2 text-xs text-black/60">
        <span>{fileName ?? "Dokuman"}</span>
        <span>Otomatik onizleme (PDF/Office)</span>
      </div>
      {isPdf ? (
        <object
          data={url ?? undefined}
          type="application/pdf"
          style={{ width: "100%", height }}
          className="bg-white"
        >
          <iframe src={url ?? undefined} title={fileName ?? "Dokuman"} className="h-full w-full" />
        </object>
      ) : (
        <iframe
          src={officeUrl ?? undefined}
          title={fileName ?? "Dokuman"}
          style={{ width: "100%", height }}
          className="bg-white"
        />
      )}
    </div>
  );
}
