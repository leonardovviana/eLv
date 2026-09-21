"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Archive,
  ArrowUpRight,
  Check,
  ExternalLink,
  Eye,
  Loader2,
  Pencil,
  Pin,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { deleteItem, setItemTags, updateItem } from "@/lib/actions/items";
import { KindIcon } from "@/components/kind-icon";
import { SectionHeader } from "@/components/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, timeAgo } from "@/lib/utils";
import { ITEM_KINDS, type Area, type Item, type ItemKind } from "@/lib/types";

/** Markdown afinado com o resto: serif nos títulos, mono e plasma no código. */
const PROSE = cn(
  "prose prose-sm prose-invert max-w-none",
  "prose-headings:font-display prose-headings:font-normal prose-headings:tracking-tightest",
  "prose-p:leading-relaxed prose-p:text-foreground/85",
  "prose-a:text-acid prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-4",
  "prose-strong:text-foreground prose-strong:font-medium",
  "prose-code:text-plasma prose-code:font-mono prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none",
  "prose-pre:bg-[hsl(var(--surface-sunken))] prose-pre:text-foreground/90 prose-pre:shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)] prose-pre:rounded-lg",
  "prose-blockquote:border-l-acid/40 prose-blockquote:text-muted-foreground prose-blockquote:not-italic",
  "prose-hr:border-[hsl(0_0%_100%/0.08)]",
  "prose-li:marker:text-muted-foreground/50",
  "prose-th:text-foreground prose-th:font-mono prose-th:text-[10px] prose-th:uppercase prose-th:tracking-[0.1em]",
);

export function ItemEditor({
  item,
  areas,
  tags,
}: {
  item: Item;
  areas: Area[];
  tags: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [extracting, setExtracting] = useState(false);
  const [polishing, setPolishing] = useState<"revisar" | "desenvolver" | null>(null);
  // Vira true ao aceitar uma versão DESENVOLVIDA, e é gravado no save. Revisão
  // de forma não marca nada: ali o conteúdo continua inteiramente seu.
  const [expandedByAi, setExpandedByAi] = useState(false);
  const [polished, setPolished] = useState<{
    mode: "revisar" | "desenvolver";
    degraded?: boolean;
    content: string;
    title: string;
    summary: string;
    why_useful: string;
    changes: string[];
    additions: string[];
    sources: { id: string; title: string }[];
  } | null>(null);

  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [summary, setSummary] = useState(item.summary ?? "");
  const [whyUseful, setWhyUseful] = useState(item.why_useful ?? "");
  const [kind, setKind] = useState<ItemKind>(item.kind);
  const [areaId, setAreaId] = useState(item.area_id ?? "none");
  const [tagText, setTagText] = useState(tags.join(", "));

  function save() {
    startTransition(async () => {
      const res = await updateItem(item.id, {
        title,
        content,
        summary: summary || null,
        why_useful: whyUseful || null,
        kind,
        area_id: areaId === "none" ? null : areaId,
        // Salvar uma semente na mão é destilar na mão: ela entra no ciclo com
        // a primeira revisão agendada, igual à destilação em lote.
        stage: item.stage === "seed" ? "sprout" : item.stage,
        ...(expandedByAi ? { ai_expanded_at: new Date().toISOString() } : {}),
      });

      if (!res.ok) {
        toast.error("Não consegui salvar", { description: res.error });
        return;
      }

      await setItemTags(
        item.id,
        tagText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      );

      toast.success("Salvo");
      setEditing(false);
      router.refresh();
    });
  }

  function togglePin() {
    startTransition(async () => {
      await updateItem(item.id, { pinned: !item.pinned });
      router.refresh();
    });
  }

  function archive() {
    startTransition(async () => {
      await updateItem(item.id, { stage: "dormant" });
      toast.success("Hibernado", { description: "Sai da fila de revisão e continua na busca." });
      router.push("/");
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteItem(item.id);
      if (res.ok) {
        toast.success("Apagado");
        router.push("/");
      } else {
        toast.error("Não consegui apagar", { description: res.error });
      }
    });
  }

  /**
   * Manda a IA melhorar a nota que VOCÊ escreveu.
   *
   * Dois modos, e a diferença é o ponto: "revisar" mexe só na forma;
   * "desenvolver" tem licença para acrescentar e é obrigado a declarar o que
   * acrescentou. Um botão só, com a licença escondida atrás dele, tiraria de
   * você a escolha que mais importa aqui.
   *
   * O resultado não entra no campo: fica ao lado, para comparar. Trocar o seu
   * texto por outro sem mostrar o que mudou é o jeito mais rápido de perder
   * a confiança no botão e nunca mais apertar.
   */
  async function polish(mode: "revisar" | "desenvolver") {
    const text = content.trim();
    if (text.length < 12) {
      toast.info("Escreva um pouco mais antes de pedir ajuda.");
      return;
    }

    setPolishing(mode);
    try {
      const res = await fetch("/api/ai/polish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, title, mode, itemId: item.id }),
      });
      const json = await res.json();

      if (!res.ok) {
        // 503 é pico de demanda do Google, não erro seu: o toast oferece a
        // volta em vez de mandar você caçar o botão de novo.
        toast.error(
          json.quota
            ? "Quota do Gemini esgotada"
            : json.retry
              ? "Gemini sobrecarregado"
              : "Não consegui melhorar",
          {
            description: json.error,
            ...(json.retry
              ? { action: { label: "Tentar de novo", onClick: () => polish(mode) } }
              : {}),
          },
        );
        return;
      }

      setPolished({ mode, degraded: json.degraded, ...json.polished });
      toast.success("Versão pronta", {
        description:
          mode === "desenvolver"
            ? "Veja o que foi acrescentado antes de aceitar."
            : "Compare e decida.",
      });
    } catch {
      toast.error("Falha de rede ao chamar a IA.");
    } finally {
      setPolishing(null);
    }
  }

  /** Aceita a reescrita. Só preenche resumo e "serve para" se estiverem
   *  vazios: o que você já escreveu à mão nesses campos continua seu. */
  function acceptPolish() {
    if (!polished) return;
    setContent(polished.content);
    if (!title.trim() && polished.title) setTitle(polished.title);
    if (!summary.trim() && polished.summary) setSummary(polished.summary);
    if (!whyUseful.trim() && polished.why_useful) setWhyUseful(polished.why_useful);
    if (polished.mode === "desenvolver") setExpandedByAi(true);
    setPolished(null);
    toast.success("Aplicado. Salve para gravar.");
  }

  /** Reextrai título, resumo e "serve para" a partir da URL. */
  async function reextract() {
    if (!item.url) return;
    setExtracting(true);
    try {
      const res = await fetch("/api/ai/extract-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.quota ? "Quota do Gemini esgotada" : "Não consegui extrair", {
          description: json.error,
        });
        return;
      }

      const ex = json.extraction;
      if (!ex) {
        toast.info("Sem IA configurada. Só metadados foram lidos.");
        return;
      }

      setTitle(ex.title ?? title);
      setSummary(ex.summary ?? summary);
      setWhyUseful(ex.why_useful ?? whyUseful);
      if (ex.kind) setKind(ex.kind);
      if (ex.area_id) setAreaId(ex.area_id);
      if (Array.isArray(ex.tags)) setTagText(ex.tags.join(", "));
      setEditing(true);
      toast.success("Extraído. Revise e salve.");
    } catch {
      toast.error("Falha de rede ao extrair.");
    } finally {
      setExtracting(false);
    }
  }

  const area = areas.find((a) => a.id === item.area_id);
  const kindLabel = ITEM_KINDS.find((k) => k.value === item.kind)?.label;

  // ── Leitura ──────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="space-y-8">
        <header>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="muted">
                  <KindIcon kind={item.kind} />
                  {kindLabel}
                </Badge>
                {area && (
                  <Badge
                    variant="outline"
                    style={{ color: area.color }}
                    className="shadow-[inset_0_0_0_1px_currentColor]"
                  >
                    {area.name}
                  </Badge>
                )}
                {item.pinned && (
                  <Badge>
                    <Pin />
                    Fixado
                  </Badge>
                )}
              </div>

              <h1 className="display-sm text-balance">{item.title || "Sem título"}</h1>

              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group mt-4 inline-flex max-w-full items-center gap-2 font-mono text-[11px] tracking-wide text-muted-foreground transition-colors hover:text-acid"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.url}</span>
                  <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              )}
            </div>

            <div className="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={togglePin}
                title={item.pinned ? "Desafixar" : "Fixar"}
                className={cn(item.pinned && "text-acid")}
              >
                <Pin />
                <span className="sr-only">{item.pinned ? "Desafixar" : "Fixar"}</span>
              </Button>
              <Button size="icon" variant="outline" onClick={() => setEditing(true)} title="Editar">
                <Pencil />
                <span className="sr-only">Editar</span>
              </Button>
            </div>
          </div>
        </header>

        {(item.summary || item.why_useful) && (
          <div className="panel divide-y divide-[hsl(0_0%_100%/0.06)] overflow-hidden">
            {item.summary && (
              <div className="p-5">
                <p className="label mb-2.5">O que é</p>
                <p className="text-pretty text-sm leading-relaxed text-foreground/85">
                  {item.summary}
                </p>
              </div>
            )}
            {item.why_useful && (
              <div className="p-5">
                <p className="label mb-2.5 text-acid">Serve para</p>
                <p className="text-pretty text-sm leading-relaxed text-foreground/85">
                  {item.why_useful}
                </p>
              </div>
            )}
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="muted">
                {t}
              </Badge>
            ))}
          </div>
        )}

        {/* Procedência do texto. Discreta, mas presente: a nota não mente
            sobre quem escreveu o que tem dentro dela. */}
        {item.ai_expanded_at && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 shrink-0 text-ember" />
            Desenvolvida com IA {timeAgo(item.ai_expanded_at)}. Partes deste texto não são suas.
          </p>
        )}

        {item.content && (
          <>
            <div className="rule" />
            <article className={PROSE}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
            </article>
          </>
        )}

        <div>
          <div className="rule mb-5" />
          <div className="flex flex-wrap gap-2">
            {item.url && (
              <Button size="sm" variant="plasma" onClick={reextract} disabled={extracting}>
                {extracting ? <Loader2 className="animate-spin" /> : <Wand2 />}
                Reextrair com IA
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={archive} disabled={pending}>
              <Archive />
              Arquivar
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="hover:text-destructive" disabled={pending}>
                  <Trash2 />
                  Apagar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <span className="label text-destructive">Ação irreversível</span>
                  <AlertDialogTitle>Apagar este item?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Some do acervo e da busca. Para tirar da frente sem perder, prefira arquivar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Apagar de vez</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    );
  }

  // ── Edição ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="h-1.5 w-1.5 animate-blink rounded-full bg-acid" />
        <span className="label">Editando</span>
      </div>

      <div className="panel space-y-5 p-5 md:p-6">
        <div className="space-y-2.5">
          <Label htmlFor="title">Título</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            className="h-12 text-lg font-medium"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2.5">
            <Label>Área</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger>
                <SelectValue placeholder="Área" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem área</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2.5">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ItemKind)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                {ITEM_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="separadas por vírgula"
          />
        </div>
      </div>

      <div className="panel space-y-5 p-5 md:p-6">
        <div className="space-y-2.5">
          <Label htmlFor="summary">Resumo: o que é isso?</Label>
          <Textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="min-h-20"
          />
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="why" className="text-acid">
            Serve para: em que situação isso te ajuda?
          </Label>
          <Textarea
            id="why"
            value={whyUseful}
            onChange={(e) => setWhyUseful(e.target.value)}
            className="min-h-20"
          />
        </div>
      </div>

      <div className="panel space-y-2.5 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="content">Anotações em markdown</Label>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => polish("revisar")}
              disabled={polishing !== null || content.trim().length < 12}
              title="Só a forma: ortografia, pontuação, estrutura"
            >
              {polishing === "revisar" ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {polishing === "revisar" ? "Revisando" : "Revisar texto"}
            </Button>

            <Button
              size="sm"
              variant="plasma"
              onClick={() => polish("desenvolver")}
              disabled={polishing !== null || content.trim().length < 12}
              title="Acrescenta contexto, ressalvas e exemplos, e declara o que acrescentou"
            >
              {polishing === "desenvolver" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {polishing === "desenvolver" ? "Desenvolvendo" : "Desenvolver"}
            </Button>
          </div>
        </div>

        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="# Título&#10;&#10;Anotações em markdown..."
          className="min-h-64 font-mono text-xs leading-relaxed"
        />

        {polished && (
          <div
            className={cn(
              "animate-rise rounded-lg bg-[hsl(var(--surface-raised))] p-4",
              polished.mode === "desenvolver"
                ? "shadow-[inset_0_0_0_1px_hsl(var(--ember)/0.35)]"
                : "shadow-[inset_0_0_0_1px_hsl(var(--plasma)/0.3)]",
            )}
          >
            <p
              className={cn(
                "flex items-center gap-2 text-[13px]",
                polished.mode === "desenvolver" ? "text-ember" : "text-plasma",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {polished.mode === "desenvolver"
                ? "Versão desenvolvida"
                : "Versão revisada (só a forma)"}
            </p>

            {/* Trocar de modelo por baixo dos panos e não contar seria
                economizar um erro e gastar confiança. */}
            {polished.degraded && (
              <p className="mt-2 text-xs text-muted-foreground">
                O modelo principal estava sobrecarregado, então isto saiu do modelo leve. Vale
                tentar de novo mais tarde para comparar.
              </p>
            )}

            {/* O que a IA ACRESCENTOU vem antes de tudo, em cor de atrito.
                É a informação que decide se você aceita ou não, e enterrá-la
                depois do texto seria esconder o que importa. */}
            {polished.additions.length > 0 && (
              <div className="mt-3 rounded-md bg-[hsl(var(--ember)/0.07)] p-3 shadow-[inset_0_0_0_1px_hsl(var(--ember)/0.2)]">
                <p className="text-xs font-medium text-ember">
                  Isto não estava na sua nota:
                </p>
                <ul className="mt-2 space-y-1">
                  {polished.additions.map((add, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-foreground/80">
                      <span aria-hidden className="text-ember">
                        +
                      </span>
                      {add}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {polished.changes.length > 0 && (
              <ul className="mt-3 space-y-1">
                {polished.changes.map((change, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <span aria-hidden className="text-plasma">
                      ·
                    </span>
                    {change}
                  </li>
                ))}
              </ul>
            )}

            {/* O texto proposto inteiro, não um trecho: aceitar sem ler o
                que se está aceitando é o que a comparação existe para evitar. */}
            <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-[hsl(var(--surface-sunken))] p-3 font-mono text-xs leading-relaxed text-foreground/85 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)]">
              {polished.content}
            </pre>

            {polished.sources.length > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>Puxou do seu acervo:</span>
                {polished.sources.map((src) => (
                  <Link
                    key={src.id}
                    href={`/item/${src.id}`}
                    className="max-w-[220px] truncate text-plasma underline-offset-4 hover:underline"
                  >
                    {src.title}
                  </Link>
                ))}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={acceptPolish}>
                <Check />
                Usar esta versão
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPolished(null)}>
                <Undo2 />
                Ficar com a minha
              </Button>
              <span className="text-xs text-muted-foreground">
                Nada é gravado até você salvar.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
          <Eye />
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function RelatedList({
  items,
}: {
  items: { id: string; title: string; summary: string | null; similarity: number }[];
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="rule mb-6" />
      <SectionHeader label="Relacionados" count={String(items.length).padStart(2, "0")} />

      <div className="space-y-2">
        {items.map((r) => {
          const pct = Math.round(r.similarity * 100);
          return (
            <Link
              key={r.id}
              href={`/item/${r.id}`}
              className="group flex items-center gap-4 rounded-lg bg-surface p-4 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)] transition-shadow duration-300 hover:shadow-[inset_0_0_0_1px_hsl(var(--plasma)/0.3)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                {r.summary && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{r.summary}</p>
                )}
              </div>

              {/* A proximidade é o motivo de o item estar aqui — então é exibida. */}
              <span className="flex shrink-0 items-center gap-2">
                <span
                  aria-hidden
                  className="hidden h-[3px] w-12 overflow-hidden rounded-full bg-[hsl(0_0%_100%/0.07)] sm:block"
                >
                  <span
                    className="block h-full rounded-full bg-plasma"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="font-mono text-[10px] tabular-nums text-plasma">{pct}%</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
