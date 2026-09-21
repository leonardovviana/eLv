"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Database, Download, Loader2, LogOut, PackagePlus, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { plantGarden } from "@/lib/actions/cycle";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export function ConfigClient({
  email,
  name: initialName,
  pendingIndex,
  usageToday,
  aiConfigured,
  models,
}: {
  email: string;
  name: string;
  pendingIndex: number;
  usageToday: number;
  aiConfigured: boolean;
  models: { fast: string; heavy: string; embed: string };
}) {
  const router = useRouter();
  const [indexing, setIndexing] = useState(false);
  const [pending, setPending] = useState(pendingIndex);
  const [seeding, setSeeding] = useState(false);
  const [name, setName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);

  /**
   * O nome fica no metadado da conta, não numa tabela nova: é um campo só,
   * ele já viaja junto da sessão, e uma tabela de perfil para guardar isso
   * seria uma junção a mais em toda tela que cumprimenta você.
   */
  async function saveName() {
    setSavingName(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ data: { name: name.trim() } });
    setSavingName(false);

    if (error) {
      toast.error("Não consegui salvar", { description: error.message });
      return;
    }
    toast.success(name.trim() ? `Combinado, ${name.trim().split(/\s+/)[0]}` : "Nome removido");
    router.refresh();
  }

  async function runSeed() {
    setSeeding(true);
    const res = await plantGarden();
    setSeeding(false);

    if (!res.ok) {
      toast.error("Não consegui plantar", { description: res.error });
      return;
    }

    const n = res.data?.planted ?? 0;
    toast.success(n ? `${n} ${n === 1 ? "item plantado" : "itens plantados"}` : "O acervo já está plantado", {
      description: n ? "Indexe para eles entrarem na busca semântica." : undefined,
    });
    router.refresh();
  }

  async function runIndex() {
    setIndexing(true);
    try {
      const res = await fetch("/api/ai/embed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.quota ? "Quota do Gemini esgotada" : "Falha ao indexar", {
          description: json.error,
        });
        return;
      }

      setPending(json.pending ?? 0);
      toast.success(
        json.indexed
          ? `${json.indexed} ${json.indexed === 1 ? "item indexado" : "itens indexados"} (${json.chunks} trechos)`
          : "Nada pendente",
        {
          description: json.pending > 0 ? `Ainda faltam ${json.pending}. Rode de novo.` : undefined,
        },
      );
      router.refresh();
    } catch {
      toast.error("Falha de rede ao indexar.");
    } finally {
      setIndexing(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* ── Estado da máquina ──────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel flex flex-col p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label flex items-center gap-2">
                <Database className="h-3 w-3" />
                Busca semântica
              </p>
              <p className="numeral mt-4 text-5xl" data-numeric>
                <span className={pending === 0 ? "text-acid" : "text-ember"}>{pending}</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {pending === 0
                  ? "tudo indexado"
                  : pending === 1
                    ? "item fora do índice"
                    : "itens fora do índice"}
              </p>
            </div>

            <span
              aria-hidden
              className={`mt-1 h-1.5 w-1.5 rounded-full ${
                pending === 0 ? "bg-acid" : "animate-blink bg-ember"
              }`}
            />
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            A indexação roda sob demanda para não gastar quota a cada anotação salva. Só o que
            mudou de texto volta para a fila.
          </p>

          <div className="mt-auto pt-5">
            <Button
              size="sm"
              onClick={runIndex}
              disabled={indexing || pending === 0 || !aiConfigured}
            >
              {indexing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {indexing ? "Indexando" : "Indexar pendentes"}
            </Button>

            {!aiConfigured && (
              <p className="mt-3 datum text-ember">
                GEMINI_API_KEY ausente, IA desligada
              </p>
            )}
          </div>
        </section>

        <section className="panel flex flex-col p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label">Uso da IA hoje</p>
              <p className="numeral mt-4 text-5xl text-plasma" data-numeric>
                {usageToday}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {usageToday === 1 ? "chamada registrada" : "chamadas registradas"}
              </p>
            </div>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            O free tier do Gemini é apertado e o Google não expõe o saldo por API. Este contador é
            do próprio app.
          </p>

          {/* Modelos: dado puro, então mono e alinhado como tabela. */}
          <dl className="mt-auto space-y-2 pt-5 datum">
            {[
              ["Volume", models.fast],
              ["Pesado", models.heavy],
              ["Embedding", models.embed],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-3">
                <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
                <span aria-hidden className="h-px flex-1 bg-[hsl(0_0%_100%/0.07)]" />
                <dd className="truncate text-foreground/80">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* ── Conteúdo de partida ────────────────────────────────────── */}
      <section className="panel p-5 md:p-6">
        <p className="label flex items-center gap-2">
          <PackagePlus className="h-3 w-3" />
          Conteúdo de partida
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Dez repositórios de IA, agentic e coding já categorizados, cada um com uma nota de em
          que situação te serve. São itens normais: dá para editar e apagar. Rodar de novo não
          duplica nada.
        </p>
        <div className="mt-5">
          <Button size="sm" variant="outline" onClick={runSeed} disabled={seeding}>
            {seeding ? <Loader2 className="animate-spin" /> : <PackagePlus />}
            Plantar acervo de exemplo
          </Button>
        </div>
      </section>

      {/* ── Backup e conta ─────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel p-5 md:p-6">
          <p className="label">Backup</p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Baixa tudo em JSON: áreas, itens, tags e trilhas. Embeddings ficam de fora de
            propósito: são derivados e voltam com um clique.
          </p>
          <div className="mt-5">
            <Button asChild size="sm" variant="outline">
              <a href="/api/export" download>
                <Download />
                Exportar JSON
              </a>
            </Button>
          </div>
        </section>

        <section className="panel flex flex-col p-5 md:p-6">
          <p className="label">Conta</p>
          <p className="mt-4 break-all font-mono text-xs text-foreground/80">{email}</p>

          <label htmlFor="display-name" className="mt-6 block text-sm text-muted-foreground">
            Como devo te chamar
          </label>
          <div className="mt-2 flex gap-2">
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              placeholder="Seu nome"
              maxLength={40}
              className="h-9"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={saveName}
              disabled={savingName || name === initialName}
              className="h-9 shrink-0"
            >
              {savingName ? <Loader2 className="animate-spin" /> : <Check />}
              Salvar
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            É o nome que aparece na saudação da tela Hoje.
          </p>

          <div className="mt-auto pt-5">
            <Button size="sm" variant="ghost" onClick={signOut}>
              <LogOut />
              Sair
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
