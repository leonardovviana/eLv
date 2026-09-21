"use client";

import { useState } from "react";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/browser";
import { getSiteUrl } from "@/lib/site-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setSending(true);

    // Carrega o destino original até o outro lado do magic link. Sem isto, um
    // link vindo do Share Target (/fluxo?url=...) se perderia no login.
    // A origem vem de getSiteUrl(), não da aba: em preview da Vercel o link
    // do e-mail apontaria para um domínio fora das Redirect URLs.
    const callback = new URL("/auth/callback", getSiteUrl());
    if (next?.startsWith("/")) callback.searchParams.set("next", next);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback.toString() },
    });
    setSending(false);

    if (error) {
      toast.error("Não consegui enviar o link", { description: error.message });
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="panel p-6 text-center">
        <span className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-[hsl(var(--acid)/0.12)] text-acid shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.3)]">
          <MailCheck className="h-4 w-4" />
        </span>
        <p className="font-display text-2xl tracking-tightest">Link enviado</p>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          Abra o e-mail em <span className="font-mono text-xs text-acid">{email}</span> e clique
          no link para entrar. Pode fechar esta aba.
        </p>
        <Button variant="ghost" size="sm" className="mt-5" onClick={() => setSent(false)}>
          Usar outro e-mail
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="panel space-y-5 p-6">
      <div className="space-y-2.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="voce@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12"
        />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={sending}>
        {sending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        {sending ? "Enviando" : "Receber link"}
      </Button>

      <p className="flex items-center justify-center gap-2 text-center datum">
        <span className="h-1 w-1 rounded-full bg-acid" />
        Sem senha · link válido por minutos
      </p>
    </form>
  );
}
