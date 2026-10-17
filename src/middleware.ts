import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Keeps the Supabase session cookie fresh on every page request. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // Touching the user refreshes an expiring token. Don't put logic between createServerClient and this call.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Skip static files, images and webhooks/cron (they don't use the visitor session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|api/webhooks|api/cron|.*\\.(?:png|jpg|jpeg|webp|avif|svg)$).*)"],
};
