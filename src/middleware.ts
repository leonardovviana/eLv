import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// `/preview` é a bancada de QA visual: monta as peças da interface com dados
// de fixture e não toca no banco. Fica pública porque o objetivo dela é
// justamente inspecionar o desenho sem uma sessão.
const PUBLIC_PATHS = ["/login", "/auth/callback", "/manifest.json", "/sw.js", "/preview"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Não remova: é este getUser() que renova o token expirado.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    // Rotas de API respondem 401 em JSON, nunca um redirect para HTML.
    // Se a sessão expira com o app aberto, um fetch que recebe a página de
    // login quebra no res.json() e o usuário vê "falha de rede" em vez de
    // "sua sessão expirou".
    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "Sessão expirada. Entre de novo." }, { status: 401 });
    }

    // Preserva a query inteira, não só o pathname: um link chegando pelo
    // Share Target (/fluxo?url=...) seria perdido no login sem isso.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    // Já logado: vai direto para onde estava indo, não para a home.
    const next = request.nextUrl.searchParams.get("next");
    const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
    return NextResponse.redirect(new URL(target, request.nextUrl.origin));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|.*\\.svg).*)"],
};
