"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CornerDownLeft, Loader2, Sprout } from "lucide-react";
import { toast } from "sonner";
import { captureItem } from "@/lib/actions/items";
import { KindIcon } from "@/components/kind-icon";
import { Button } from "@/components/ui/button";
import { useRipple } from "@/components/motion";
import { guessKind } from "@/lib/utils";
import { ITEM_KINDS } from "@/lib/types";

/**
 * Barra de captura.
 *
 * O campo cresce com o texto em vez de rolar: ver o que se escreveu inteiro
 * é o que permite capturar um parágrafo sem medo. E o tipo detectado aparece
 * ANTES de salvar — a inferência deixa de ser surpresa depois do fato.
 */
export function CaptureBar() {
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sharedRef = useRef(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const ripple = useRipple<HTMLButtonElement>();

  // Share Target do PWA: o Android abre /fluxo?url=...&text=...&title=...
  // Capturamos na hora — quem compartilhou já decidiu que quer guardar;
  // pedir um clique de confirmação só adicionaria atrito.
  useEffect(() => {
    if (sharedRef.current) return;

    const url = searchParams.get("url");
    const text = searchParams.get("text");
    const title = searchParams.get("title");
    const raw = (url || text || "").trim();
    if (!raw) return;

    sharedRef.current = true;

    captureItem({ raw, title: title ?? undefined }).then((res) => {
      if (res.ok) {
        toast.success("Semente plantada", { description: title || raw.slice(0, 60) });
      } else {
        toast.error("Não consegui capturar", { description: res.error });
      }
      // Limpa os parâmetros para um F5 não recapturar o mesmo link.
      router.replace("/fluxo");
      router.refresh();
    });
  }, [searchParams, router]);

  // Altura acompanha o conteúdo. `auto` antes de medir, senão o scrollHeight
  // fica preso na maior altura que o campo já teve e ele nunca encolhe.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);

  const trimmed = value.trim();
  const detected = useMemo(() => (trimmed ? guessKind(trimmed) : null), [trimmed]);
  const detectedLabel = detected
    ? (ITEM_KINDS.find((k) => k.value === detected)?.label ?? detected)
    : null;

  function submit() {
    const raw = value.trim();
    if (!raw || pending) return;

    startTransition(async () => {
      const res = await captureItem({ raw });
      if (res.ok) {
        setValue("");
        setFlash(true);
        setTimeout(() => setFlash(false), 700);
        toast.success("Semente plantada", { description: res.data?.title });
        router.refresh();
      } else {
        toast.error("Não consegui capturar", { description: res.error });
      }
    });
  }

  return (
    <div
      className="panel overflow-hidden transition-shadow duration-500"
      style={
        flash
          ? { boxShadow: "inset 0 0 0 1px hsl(var(--acid) / 0.6), 0 0 60px -20px hsl(var(--acid) / 0.7)" }
          : undefined
      }
    >
      {/* Trilho superior: rótulo do módulo e o atalho, como num painel físico. */}
      <div className="flex items-center justify-between px-4 py-2.5 shadow-[inset_0_-1px_0_0_hsl(0_0%_100%/0.06)]">
        <span className="label flex items-center gap-2">
          <span className="beat" />
          Captura
        </span>

        <span className="hidden items-center gap-1.5 datum/70 sm:flex">
          <kbd className="rounded-[3px] bg-[hsl(0_0%_100%/0.05)] px-1.5 py-0.5 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.08)]">
            Ctrl
          </kbd>
          <CornerDownLeft className="h-3 w-3" />
        </span>
      </div>

      <textarea
        ref={areaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
        placeholder="Cola um link, um trecho de código, um prompt ou só uma ideia solta..."
        className="block max-h-80 w-full resize-none bg-transparent px-4 py-4 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 md:text-sm"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)]">
        {detectedLabel ? (
          <span className="flex animate-fade-in items-center gap-2 datum text-acid">
            <KindIcon kind={detected!} className="h-3 w-3" />
            {detectedLabel} detectado
            <span className="text-muted-foreground/50">· vira semente</span>
          </span>
        ) : (
          <span className="label truncate">Sem categoria. A destilação vem depois.</span>
        )}

        <Button
          size="sm"
          onClick={submit}
          onPointerDown={ripple}
          disabled={pending || !trimmed}
          className="ripple-host ml-auto"
        >
          {pending ? <Loader2 className="animate-spin" /> : <Sprout />}
          Plantar
        </Button>
      </div>
    </div>
  );
}
