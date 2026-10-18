"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser client that reads the same session cookie as the server. Used only to get the admin's access token for direct-to-Storage uploads. */
export function browserDb(): SupabaseClient {
  if (!client) client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}

/** Fresh access token (the client refreshes it when it is about to expire). */
export async function accessToken(): Promise<string> {
  const { data, error } = await browserDb().auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่");
  return token;
}
