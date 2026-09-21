"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  Compass,
  CornerDownLeft,
  Layers,
  Loader2,
  Map as MapIcon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Waves,
} from "lucide-react";
import { toast } from "sonner";
import { captureItem } from "@/lib/actions/items";
import { KindIcon } from "@/components/kind-icon";
import { guessKind } from "@/lib/utils";
import { ITEM_KINDS } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROUTES = [
  { href: "/", label: "Hoje", hint: "pulso e próximo movimento", icon: Waves },
  { href: "/fluxo", label: "Fluxo", hint: "capturar e destilar", icon: Layers },
  { href: "/revisar", label: "Revisar", hint: "fila do dia", icon: Sparkles },
  { href: "/buscar", label: "Buscar", hint: "encontrar e perguntar", icon: Search },
  { href: "/mapa", label: "Mapa", hint: "conexões e áreas", icon: MapIcon },
  { href: "/trilhas", label: "Trilhas", hint: "roteiros de estudo", icon: Compass },
  { href: "/config", label: "Config", hint: "índice, IA e backup", icon: Settings },
];

/**
 * Barra de comando — o teclado do app.
 *
 * Existe porque capturar não pode depender de estar na tela certa. Na v1, a
 * captura morava só no Inbox: guardar uma ideia enquanto você lia um item
 * custava uma navegação, perder o contexto e voltar. Aqui é ⌘K, digitar,
 * Enter, e você continua exatamente onde estava.
 *
 * A ordem das opções é fixa e nunca reordena por "relevância": a memória
 * muscular de "⌘K, texto, Enter = capturei" vale mais do que acertar a
 * intenção de vez em quando.
 */
export function CommandBar() {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((o) => !o);
        return;
      }

      // Barra abre a paleta direto na busca, como em editor de código — mas
      // só quando o foco não está num campo, senão digitar "/" viraria um
      // atalho no meio de uma frase.
      if (event.key === "/" && !isTyping(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trimmed = value.trim();
  const kind = trimmed ? guessKind(trimmed) : null;
  const kindLabel = kind ? ITEM_KINDS.find((k) => k.value === kind)?.label : null;

  const routes = trimmed
    ? ROUTES.filter((r) => normalize(r.label + r.hint).includes(normalize(trimmed)))
    : ROUTES;

  type Action = { id: string; run: () => void; render: React.ReactNode };

  const actions: Action[] = [];

  if (trimmed) {
    actions.push({
      id: "capture",
      run: () => capture(),
      render: (
        <Row
          icon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          label="Capturar como semente"
          value={trimmed}
          tag={kindLabel ?? undefined}
          tagIcon={kind ? <KindIcon kind={kind} className="h-2.5 w-2.5" /> : undefined}
          tone="acid"
        />
      ),
    });

    actions.push({
      id: "search",
      run: () => go(`/buscar?q=${encodeURIComponent(trimmed)}`),
      render: (
        <Row
          icon={<Search className="h-4 w-4" />}
          label="Buscar no acervo"
          value={trimmed}
          tone="plasma"
        />
      ),
    });

    actions.push({
      id: "ask",
      run: () => go(`/buscar?q=${encodeURIComponent(trimmed)}&modo=perguntar`),
      render: (
        <Row
          icon={<Sparkles className="h-4 w-4" />}
          label="Perguntar ao cérebro"
          value={trimmed}
          tone="plasma"
        />
      ),
    });
  }

  for (const route of routes) {
    const Icon = route.icon;
    actions.push({
      id: route.href,
      run: () => go(route.href),
      render: <Row icon={<Icon className="h-4 w-4" />} label={route.label} value={route.hint} />,
    });
  }

  const safeCursor = Math.min(cursor, Math.max(0, actions.length - 1));

  // Fechar limpa o estado aqui, e não num efeito observando `open`: o efeito
  // fazia um segundo render a cada fechamento só para zerar três campos.
  function close() {
    setOpen(false);
    setValue("");
    setCursor(0);
    setPending(false);
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  function capture() {
    if (!trimmed || pending) return;
    setPending(true);

    captureItem({ raw: trimmed }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast.error("Não consegui capturar", { description: res.error });
        return;
      }

      toast.success("Semente plantada", {
        description: res.data?.title,
        action: { label: "Destilar", onClick: () => router.push("/fluxo") },
      });

      close();
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[hsl(var(--background)/0.7)] backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2",
            "overflow-hidden rounded-xl bg-[hsl(var(--popover))] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.1),0_40px_80px_-32px_hsl(0_0%_0%/0.95)]",
            "data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-4 data-[state=open]:zoom-in-95",
          )}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((c) => (c + 1) % Math.max(1, actions.length));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((c) => (c - 1 + actions.length) % Math.max(1, actions.length));
            } else if (event.key === "Enter") {
              event.preventDefault();
              actions[safeCursor]?.run();
            } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              capture();
            }
          }}
        >
          <Dialog.Title className="sr-only">Barra de comando</Dialog.Title>
          <Dialog.Description className="sr-only">
            Capture, busque ou navegue pelo app.
          </Dialog.Description>

          <div className="flex items-center gap-3 px-4 py-3.5 shadow-[inset_0_-1px_0_0_hsl(0_0%_100%/0.07)]">
            <span className="beat shrink-0" />
            <input
              autoFocus
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setCursor(0);
              }}
              placeholder="Cole, escreva ou procure qualquer coisa"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/60 md:text-sm"
              aria-label="Comando"
            />
            <kbd className="hidden shrink-0 rounded-[3px] bg-[hsl(0_0%_100%/0.05)] px-1.5 py-1 datum shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.08)] sm:block">
              esc
            </kbd>
          </div>

          <div className="max-h-[52vh] overflow-y-auto p-1.5">
            {actions.map((action, i) => (
              <button
                key={action.id}
                type="button"
                onClick={action.run}
                onPointerMove={() => setCursor(i)}
                data-active={i === safeCursor}
                className="group block w-full rounded-md px-2.5 py-2 text-left transition-colors duration-150 data-[active=true]:bg-[hsl(0_0%_100%/0.05)]"
              >
                {action.render}
              </button>
            ))}

            {actions.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nada por aqui.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-2.5 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.07)]">
            <span className="label truncate">
              {trimmed ? `${kindLabel ?? "Texto"} detectado` : "⌘K de qualquer tela"}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 datum/70">
              <CornerDownLeft className="h-3 w-3" />
              executar
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({
  icon,
  label,
  value,
  tag,
  tagIcon,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  tag?: string;
  tagIcon?: React.ReactNode;
  tone?: "acid" | "plasma" | "muted";
}) {
  const toneClass = {
    acid: "text-acid",
    plasma: "text-plasma",
    muted: "text-muted-foreground group-data-[active=true]:text-foreground",
  }[tone];

  return (
    <span className="flex items-center gap-3">
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center", toneClass)}>
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{label}</span>
        {value && (
          <span className="mt-0.5 block truncate font-mono text-[10px] tracking-wide text-muted-foreground">
            {value}
          </span>
        )}
      </span>

      {tag && (
        <span className="flex shrink-0 items-center gap-1 rounded-[3px] bg-[hsl(0_0%_100%/0.05)] px-1.5 py-0.5 datum">
          {tagIcon}
          {tag}
        </span>
      )}

      <ArrowRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-200 group-data-[active=true]:translate-x-0 group-data-[active=true]:opacity-100" />
    </span>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
