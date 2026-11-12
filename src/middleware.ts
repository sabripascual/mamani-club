import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/ingresar", "/registro", "/zz"];

/**
 * Refresca la sesión de Supabase en cada request y manda a /ingresar a quien no
 * tenga sesión. Los permisos finos (pendiente, admin) se validan en el servidor
 * de cada página y, sobre todo, en la base con RLS.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/ingresar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    // Todo salvo estáticos, íconos, manifest, service worker y el cron.
    "/((?!_next/static|_next/image|icon.png|apple-icon.png|icons/|manifest.webmanifest|sw.js|offline.html|api/cron).*)",
  ],
};
