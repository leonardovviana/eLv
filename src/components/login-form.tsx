"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, TriangleAlert, UserPlus } from "lucide-react";
import { authenticate, type LoginState } from "@/app/login/actions";
import { PASSWORD_MIN, USERNAME_HINT } from "@/lib/username";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "entrar" | "criar";

const EMPTY: LoginState = { error: null };

/**
 * Usuário e senha, nada mais.
 *
 * O formulário posta direto numa Server Action: sem estado de "link enviado",
 * sem volta por e-mail, e o erro chega no HTML da resposta em vez de num
 * toast que some. Trocar de modo remonta o formulário (o `key` no pai), o
 * que zera o erro da tentativa anterior — só o nome digitado sobrevive.
 */
export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<Mode>("entrar");
  const [username, setUsername] = useState("");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-[hsl(var(--surface-sunken))] p-1 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)]">
        {(["entrar", "criar"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={
              "rounded-[5px] px-3.5 py-2 datum transition-all duration-200 " +
              (mode === m
                ? "bg-[hsl(var(--surface-raised))] text-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.09),0_2px_8px_hsl(0_0%_0%/0.4)]"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {m === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      <AuthForm
        key={mode}
        mode={mode}
        next={next}
        username={username}
        onUsername={setUsername}
      />
    </div>
  );
}

function AuthForm({
  mode,
  next,
  username,
  onUsername,
}: {
  mode: Mode;
  next?: string;
  username: string;
  onUsername: (value: string) => void;
}) {
  const [state, formAction, pending] = useActionState(authenticate, EMPTY);
  const [reveal, setReveal] = useState(false);
  const creating = mode === "criar";

  return (
    <form action={formAction} className="panel space-y-5 p-6">
      <input type="hidden" name="intent" value={creating ? "criar" : "entrar"} />
      {next?.startsWith("/") && <input type="hidden" name="next" value={next} />}

      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-[hsl(var(--destructive)/0.08)] p-4 shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.3)]"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm leading-relaxed text-muted-foreground">{state.error}</p>
        </div>
      )}

      <div className="space-y-2.5">
        <Label htmlFor="username">Usuário</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={64}
          placeholder="leo"
          value={username}
          onChange={(e) => onUsername(e.target.value)}
          className="h-12"
        />
        {creating && <p className="text-xs text-muted-foreground">{USERNAME_HINT}.</p>}
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={reveal ? "text" : "password"}
            autoComplete={creating ? "new-password" : "current-password"}
            required
            minLength={creating ? PASSWORD_MIN : undefined}
            placeholder="••••••••"
            className="h-12 pr-11"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Esconder senha" : "Mostrar senha"}
            className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {creating && (
          <p className="text-xs text-muted-foreground">
            Pelo menos {PASSWORD_MIN} caracteres. Não há e-mail de recuperação: guarde-a.
          </p>
        )}
      </div>

      {creating && (
        <div className="space-y-2.5">
          <Label htmlFor="confirm">Repita a senha</Label>
          <Input
            id="confirm"
            name="confirm"
            type={reveal ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            placeholder="••••••••"
            className="h-12"
          />
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : creating ? <UserPlus /> : <ArrowRight />}
        {pending ? (creating ? "Criando" : "Entrando") : creating ? "Criar conta" : "Entrar"}
      </Button>

      <p className="flex items-center justify-center gap-2 text-center datum">
        <span className="h-1 w-1 rounded-full bg-acid" />
        Sem e-mail · a sessão fica no aparelho
      </p>
    </form>
  );
}
