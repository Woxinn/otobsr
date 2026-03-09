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
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers ?? {}),
            ...(extraHeaders ?? {}),
          },
          cache: "no-store",
          next: { revalidate: 0 },
        }),
    },
  });
}
