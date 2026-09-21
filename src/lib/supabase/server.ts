import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { usernameFromEmail } from "@/lib/username";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component: o middleware já cuida do refresh.
          }
        },
      },
    },
  );
}

/** Usuário autenticado ou null. Sempre getUser(), nunca getSession() no servidor. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Como a pessoa quer ser chamada.
 *
 * Sai do metadado da conta, que é onde o Supabase guarda o que o próprio
 * usuário define (Config → "Como devo te chamar"). Sem isso, tenta o nome de
 * usuário, e só aceita se parecer um nome de verdade: "leonardoverasviana"
 * cumprimentado no painel seria pior do que não cumprimentar ninguém.
 */
export function displayName(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) {
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  const given = (meta.name ?? meta.full_name ?? meta.first_name) as string | undefined;
  if (given && given.trim()) return given.trim().split(/\s+/)[0];

  const handle = accountName(user).split("@")[0];
  const first = handle.split(/[._-]/)[0];
  if (first.length >= 3 && first.length <= 14 && /^[a-zà-ü]+$/i.test(first)) {
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  return null;
}

/**
 * O identificador que a pessoa digita para entrar: o nome de usuário. Conta
 * antiga, criada por magic link, ainda carrega um e-mail de verdade — aí é
 * ele que aparece, porque é com ele que o login funciona.
 */
export function accountName(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) {
  if (!user) return "";
  const meta = user.user_metadata ?? {};
  const saved = meta.username as string | undefined;
  return saved?.trim() || usernameFromEmail(user.email) || user.email || "";
}
