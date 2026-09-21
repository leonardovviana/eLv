/**
 * Origem canônica do app.
 *
 * O magic link do Supabase é montado no browser, e `window.location.origin`
 * aponta para onde a aba está — que em deploy da Vercel pode ser a URL de
 * preview (elv-abc123-....vercel.app). O e-mail chegaria com um link para um
 * domínio que não está nas Redirect URLs, e o Supabase o trocaria pelo Site
 * URL do projeto. Fixar a origem aqui mantém o link sempre no domínio real.
 *
 * Ordem: NEXT_PUBLIC_SITE_URL (produção) → origem da aba (dev) → localhost.
 */
const CONFIGURED = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export function getSiteUrl() {
  const raw =
    CONFIGURED ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "http://localhost:3000";

  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}
