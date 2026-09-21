"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PASSWORD_MIN,
  emailForUsername,
  normalizeUsername,
  usernameError,
} from "@/lib/username";

export type LoginState = { error: string | null };

/**
 * Autenticação no servidor, não no browser.
 *
 * O cookie de sessão sai da própria resposta da Server Action, então a pessoa
 * já chega na tela seguinte logada — sem o passo intermediário de trocar
 * código por sessão que o magic link precisava, e sem carregar o SDK do
 * Supabase no bundle da primeira tela do app.
 */

/** Só caminho interno: "//evil.com" passaria num startsWith("/") ingênuo. */
function safeNext(raw: FormDataEntryValue | null) {
  const next = typeof raw === "string" ? raw : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** O GoTrue responde em inglês e fala de e-mail. Aqui não existe e-mail. */
function translate(message: string) {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) return "Usuário ou senha incorretos.";
  if (m.includes("already registered") || m.includes("already exists")) {
    return "Esse nome de usuário já existe. Entre com a senha dele.";
  }
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
    return "A criação de contas está desligada no Supabase (Authentication → Sign In / Providers).";
  }
  if (m.includes("password") && m.includes("characters")) {
    return `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`;
  }
  if (m.includes("weak password") || m.includes("pwned")) {
    return "Essa senha é fraca demais para o projeto. Escolha outra.";
  }
  if (m.includes("email")) {
    return "O Supabase recusou o endereço interno do usuário. Confira as regras de e-mail do projeto.";
  }
  if (m.includes("for security purposes") || m.includes("rate limit")) {
    return "Muitas tentativas seguidas. Espere alguns segundos.";
  }
  return message;
}

function readForm(formData: FormData) {
  return {
    username: normalizeUsername(String(formData.get("username") ?? "")),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
    next: safeNext(formData.get("next")),
  };
}

async function enter(username: string, password: string): Promise<LoginState> {
  if (!username || !password) return { error: "Preencha usuário e senha." };

  // Conta antiga, criada por magic link, ainda tem e-mail de verdade: quem
  // digita o endereço inteiro entra por ele em vez de virar
  // "voce@gmail.com@elv.local".
  const identifier = username.includes("@") ? username : emailForUsername(username);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: identifier,
    password,
  });

  return { error: error ? translate(error.message) : null };
}

async function create(
  username: string,
  password: string,
  confirm: string,
): Promise<LoginState> {
  const invalid = usernameError(username);
  if (invalid) return { error: invalid };
  if (password.length < PASSWORD_MIN) {
    return { error: `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.` };
  }
  if (password !== confirm) return { error: "As duas senhas não são iguais." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: emailForUsername(username),
    password,
    // Guardado no metadado para a conta saber o nome mesmo se o endereço
    // interno mudar, e para a saudação da home ter o que dizer no dia um.
    options: { data: { username } },
  });

  if (error) return { error: translate(error.message) };

  // Sem sessão aqui significa projeto com confirmação de e-mail ligada — e o
  // endereço é interno, então esse e-mail não chega a lugar nenhum.
  if (!data.session) {
    return {
      error:
        "Conta criada, mas o projeto exige confirmação de e-mail. Desligue em Supabase → Authentication → Sign In / Providers → Email → Confirm email e entre de novo.",
    };
  }

  return { error: null };
}

export async function authenticate(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const { username, password, confirm, next } = readForm(formData);
  const creating = formData.get("intent") === "criar";

  const result = creating
    ? await create(username, password, confirm)
    : await enter(username, password);

  if (result.error) return result;

  // Fora do try/catch de propósito: redirect() sinaliza por exceção.
  redirect(next);
}
