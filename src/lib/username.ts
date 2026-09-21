/**
 * Usuário e senha sobre o Supabase Auth.
 *
 * O Supabase só autentica por e-mail ou telefone. Para não pedir e-mail a
 * ninguém, o nome de usuário vira um endereço interno determinístico:
 * `leo` → `leo@elv.local`. O `.local` é reservado (RFC 6762), então não
 * existe caixa postal do outro lado e nenhuma mensagem sai do projeto —
 * o endereço é só a chave que o GoTrue exige. Quem entra nunca vê isso.
 */
export const USERNAME_DOMAIN = "elv.local";

export const USERNAME_HINT = "3 a 24 caracteres: letras, números, ponto, hífen ou _";
export const PASSWORD_MIN = 8;

const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;

/**
 * Minúsculas sempre: `Leo` e `leo` precisam cair no mesmo endereço, senão a
 * pessoa cria a conta num dia e não entra no outro por causa do shift.
 */
export function normalizeUsername(raw: string) {
  const trimmed = raw.trim().toLowerCase();
  // Tolera quem cola o endereço interno inteiro (aparece no export do banco).
  return trimmed.endsWith(`@${USERNAME_DOMAIN}`)
    ? trimmed.slice(0, -USERNAME_DOMAIN.length - 1)
    : trimmed;
}

/** Mensagem de erro, ou null se o nome serve. */
export function usernameError(username: string) {
  if (!username) return "Escolha um nome de usuário.";
  if (!USERNAME_RE.test(username)) return `Nome de usuário inválido — ${USERNAME_HINT}.`;
  return null;
}

export function emailForUsername(username: string) {
  return `${username}@${USERNAME_DOMAIN}`;
}

/**
 * O nome de usuário escondido num endereço interno. Devolve null para conta
 * criada com e-mail de verdade (as que existiam antes do login por usuário).
 */
export function usernameFromEmail(email?: string | null) {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1) === USERNAME_DOMAIN ? email.slice(0, at) : null;
}
