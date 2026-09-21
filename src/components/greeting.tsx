"use client";

import * as React from "react";

/**
 * Hora local, sem quebrar a hidratação.
 *
 * O servidor roda em UTC e cumprimentaria com "boa noite" quem está
 * almoçando, então a hora precisa vir do browser. O caminho óbvio — um
 * `useEffect` que chama `setState` — custa um segundo render em toda
 * montagem e é exatamente o que o compilador do React reclama.
 *
 * `useSyncExternalStore` foi feito para isto: serve um valor no servidor e
 * outro no cliente, e o React concilia os dois sem aviso de hidratação. O
 * `subscribe` é vazio porque nada muda depois da primeira leitura, e os
 * getters devolvem string estável dentro da mesma hora (uma leitura
 * instável faria o React repetir o render para sempre).
 */
const NO_SUBSCRIBE = () => () => {};

function greetingWord() {
  const h = new Date().getHours();
  return h < 5 ? "Boa madrugada" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

function todayWord() {
  return DATE_FORMAT.format(new Date());
}

export function Greeting({ name, className }: { name?: string | null; className?: string }) {
  const word = React.useSyncExternalStore(NO_SUBSCRIBE, greetingWord, () => "Olá");

  return (
    <span className={className}>
      {name ? `${word}, ${name}` : word}
      {/* Cursor de terminal: o app está esperando você. */}
      <span
        aria-hidden
        className="ml-1 inline-block h-[0.9em] w-[2px] animate-blink bg-acid align-middle"
      />
    </span>
  );
}

/** Data por extenso, também local. */
export function TodayLabel({ className }: { className?: string }) {
  const label = React.useSyncExternalStore(NO_SUBSCRIBE, todayWord, () => "");
  return <span className={className}>{label}</span>;
}
