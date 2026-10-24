import "server-only";

/**
 * Is "Sign in with Google" switched on in Supabase (Auth → Providers → Google)?
 * The button only shows when it is, so turning the provider on is all it takes to launch it.
 */
export async function googleEnabled(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon }, next: { revalidate: 300 } });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return !!settings.external?.google;
  } catch {
    return false;
  }
}
