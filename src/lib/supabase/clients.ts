import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Acts as the signed-in visitor (their session cookie). Row Level Security applies,
 * so use this for the visitor's own writes: likes, saves, comments, progress.
 */
export async function userDb(): Promise<SupabaseClient> {
  const jar = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there; middleware refreshes them.
        }
      },
    },
  });
}

const g = globalThis as unknown as { __tgAdmin?: SupabaseClient };

/**
 * Service role — bypasses RLS. Server only, and only after the code has checked
 * who is asking (requireAdmin, the webhook signature, the play gate, …).
 */
export function adminDb(): SupabaseClient {
  if (!g.__tgAdmin) {
    g.__tgAdmin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return g.__tgAdmin;
}

/** Throw on a Supabase error so callers don't silently render empty pages. */
export function must<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? []) as NonNullable<T>;
}
