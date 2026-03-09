import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient(extraHeaders?: Record<string, string>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin env eksik");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        Object.entries(extraHeaders ?? {}).forEach(([key, value]) => {
          headers.set(key, value);
        });

        return fetch(input, {
          ...init,
          headers,
          cache: "no-store",
          next: { revalidate: 0 },
        });
      },
    },
  });
}
