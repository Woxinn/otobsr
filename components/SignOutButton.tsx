"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut({ scope: "global" });
    // Ek olarak olasÄ± sb-* auth Ã§erezlerini temizle
    document.cookie
      .split(";")
      .map((c) => c.trim())
      .forEach((cookie) => {
        if (cookie.toLowerCase().startsWith("sb-")) {
          const name = cookie.split("=")[0];
          document.cookie = `${name}=; Max-Age=0; path=/;`;
        }
      });
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      className="rounded-full border border-black/20 bg-white px-4 py-2 text-xs font-semibold"
    >
      Çıkış
    </button>
  );
}

