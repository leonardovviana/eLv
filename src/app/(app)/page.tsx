import Link from "next/link";
import { ArrowRight, Compass, Flame, Layers, Link2, Sprout } from "lucide-react";
import { createClient, displayName, getUser } from "@/lib/supabase/server";
import { getActivity, getBrainMap, getDueQueue, getPulse, nextMove, vitalityLabel } from "@/lib/brain";
import { Garden } from "@/components/garden";
import { ItemCard } from "@/components/item-card";
import { Empty, SectionHeader } from "@/components/chrome";
import { Greeting, TodayLabel } from "@/components/greeting";
import { ActivityStrip, PlantButton, PulseRing, StageBar } from "@/components/pulse";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { overdueLabel } from "@/lib/utils";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Hoje — a tela que decide o que você faz.
 *
 * A home da v1 era um índice: quatro contadores, seis atalhos e nenhuma
 * prioridade. Quem abria tinha que escolher sozinho por onde começar, e
 * escolher é justamente o que cansa.
 *
 * Aqui a tela responde uma pergunta só — "e agora?" — com UM movimento em
 * destaque. Todo o resto é contexto: o pulso diz como o cérebro está, o
 * jardim diz onde ele está crescendo, a atividade diz se o hábito existe.
 */
export default async function TodayPage() {
  const supabase = await createClient();
  const user = await getUser();
  const name = displayName(user);

  const [pulse, due, activity, garden] = await Promise.all([
    getPulse(supabase),
    getDueQueue(supabase, 3),
    getActivity(supabase, 28),
    // Os mesmos nós da constelação alimentam o jardim: estágio, vitalidade e
    // área é tudo que uma planta precisa para existir.
    getBrainMap(supabase, 200),
  ]);

  const move = nextMove(pulse);
  const vitality = vitalityLabel(pulse.vitality);
  const empty = pulse.total === 0;

  const [{ data: areas }, { data: recent }, { data: tracks }] = await Promise.all([
    supabase.from("areas").select("id, name, slug, color, icon, sort_order").order("sort_order"),
    supabase
      .from("items")
      .select(
        "id, kind, title, summary, why_useful, url, source_meta, area_id, stage, strength, interval_days, last_reviewed_at, next_review_at",
      )
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("tracks")
      .select("id, title, track_topics(done)")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(2),
  ]);

  const areaList = (areas ?? []) as Area[];
  const areaById = new Map(areaList.map((a) => [a.id, a]));

  // Contagem por área numa consulta só, em vez de uma por área.
  const { data: areaRows } = await supabase
    .from("items")
    .select("area_id")
    .neq("status", "archived");

  const countByArea = new Map<string, number>();
  for (const row of areaRows ?? []) {
    if (row.area_id) countByArea.set(row.area_id, (countByArea.get(row.area_id) ?? 0) + 1);
  }

  const toneClass = {
    acid: "text-acid",
    plasma: "text-plasma",
    ember: "text-ember",
    muted: "text-muted-foreground",
  }[move.tone];

  return (
    <div className="space-y-12 md:space-y-16">
      {/* ── Abertura ───────────────────────────────────────────────── */}
      <section className="panel overflow-hidden">
        {/* Luz lenta atravessando o painel. É o que separa "painel ligado"
            de "imagem de painel": nada pisca, mas a superfície nunca está
            exatamente igual a dez segundos atrás. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-40 animate-aurora opacity-[0.07]"
          style={{
            background:
              "radial-gradient(45% 45% at 30% 40%, hsl(var(--acid)) 0%, transparent 60%), radial-gradient(40% 40% at 75% 60%, hsl(var(--plasma)) 0%, transparent 60%)",
          }}
        />

        <div
          aria-hidden
          className="blueprint absolute inset-0 opacity-70"
          style={{
            maskImage: "radial-gradient(100% 120% at 100% 0%, black, transparent 70%)",
            WebkitMaskImage: "radial-gradient(100% 120% at 100% 0%, black, transparent 70%)",
          }}
        />

        <div className="relative p-5 sm:p-7 md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="label flex items-center gap-2.5">
              <span className="beat" />
              <TodayLabel className="text-foreground/70" />
            </span>

            {pulse.streak > 0 && (
              <span className="flex items-center gap-1.5 rounded-[3px] bg-[hsl(var(--ember)/0.1)] px-2 py-1 datum text-ember shadow-[inset_0_0_0_1px_hsl(var(--ember)/0.26)]">
                <Flame className="h-3 w-3" />
                <span className="tabular-nums">{pulse.streak}</span>
                {pulse.streak === 1 ? "dia" : "dias seguidos"}
              </span>
            )}
          </div>

          <div className="mt-6 grid gap-8 md:grid-cols-[1fr_auto] md:items-center md:gap-10">
            <div className="min-w-0">
              <h1 className="display text-balance">
                <Greeting name={name} className="text-muted-foreground/60" />
                <br />
                {empty ? (
                  <>
                    seu cérebro está <span className="text-ember">vazio</span>
                  </>
                ) : (
                  <>
                    o cérebro está <span className={`${vitality.tone}`}>{vitality.word.toLowerCase()}</span>
                  </>
                )}
              </h1>

              {/* O próximo movimento: a única decisão da tela. */}
              <div className="shine mt-7 max-w-xl rounded-lg bg-[hsl(var(--surface-raised))] p-4 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)] sm:p-5">
                <p className={`label flex items-center gap-2 ${toneClass}`}>
                  <span className="beat" style={{ "--tone": `var(--${move.tone === "muted" ? "plasma" : move.tone})` } as React.CSSProperties} />
                  {move.label}
                </p>

                <p className="mt-3 text-pretty font-display text-2xl leading-tight tracking-tightest">
                  {move.title}
                </p>

                <p className="mt-2.5 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {move.detail}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <Button asChild size="lg" variant={move.tone === "plasma" ? "plasma" : "default"}>
                    <Link href={move.href}>
                      {move.cta}
                      <ArrowRight />
                    </Link>
                  </Button>

                  {empty && <PlantButton variant="outline" />}
                </div>
              </div>
            </div>

            {!empty && (
              <PulseRing
                value={pulse.vitality}
                label={vitality.word}
                caption="força média do que você guardou"
              />
            )}
          </div>

          {/* A composição do acervo mora no mesmo painel do pulso: o anel diz
              como está a memória, a barra diz do que ela é feita. Separar as
              duas em blocos distantes obrigava a cruzar a tela para ler uma
              informação só. */}
          {!empty && (
            <div className="mt-9 border-t border-[hsl(0_0%_100%/0.07)] pt-7">
              <StageBar pulse={pulse} />
            </div>
          )}
        </div>
      </section>

      {empty ? (
        <section>
          <Empty
            icon={Sprout}
            title="Nada plantado ainda"
            action={
              <>
                <PlantButton />
                <Button asChild variant="outline">
                  <Link href="/fluxo">Capturar na mão</Link>
                </Button>
              </>
            }
          >
            O ciclo só fica visível com acervo dentro. Plante um conjunto de partida, com sementes
            cruas, brotos e raízes já com histórico, e veja a fila, o mapa e o pulso funcionando de
            verdade. Depois é só apagar o que não for seu.
          </Empty>
        </section>
      ) : (
        <>
          {/* ── Fila de hoje ───────────────────────────────────────── */}
          {due.length > 0 && (
            <section className="enter-up">
              <SectionHeader
                label="Fila de hoje"
                count={String(pulse.due).padStart(2, "0")}
                action={
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/revisar">
                      Revisar
                      <ArrowRight />
                    </Link>
                  </Button>
                }
              />

              <div className="stagger space-y-2.5">
                {due.map((item, i) => (
                  <Link
                    key={item.id}
                    href="/revisar"
                    style={{ "--i": i } as React.CSSProperties}
                    className="spotlight lift group flex items-center gap-4 rounded-lg bg-surface p-4 shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.18)] hover:shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.4)]"
                  >
                    <span className="numeral shrink-0 text-2xl text-acid" data-numeric>
                      {item.vitality}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {item.summary ?? item.why_useful ?? "Sem resumo"}
                      </span>
                    </span>

                    <span className="hidden shrink-0 datum text-ember sm:block">
                      {overdueLabel(item.days_overdue)}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Jardim ─────────────────────────────────────────────── */}
          <section className="enter-rise">
            <SectionHeader
              label="Jardim"
              count={`${garden.nodes.length} ${garden.nodes.length === 1 ? "planta" : "plantas"}`}
            />

            <div className="panel overflow-hidden">
              <Garden nodes={garden.nodes} areas={areaList} />

              <div className="grid grid-cols-2 gap-px bg-[hsl(0_0%_100%/0.07)] shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)] sm:grid-cols-3">
                {areaList.map((area) => {
                  const n = countByArea.get(area.id) ?? 0;
                  return (
                    <Link
                      key={area.id}
                      href={`/areas/${area.slug}`}
                      style={{ "--glow": area.color } as React.CSSProperties}
                      className="spotlight group flex items-center gap-2.5 bg-[hsl(var(--surface))] px-4 py-3 transition-colors duration-300 hover:bg-[hsl(var(--surface-raised))]"
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-[2px] transition-transform duration-500 ease-spring group-hover:scale-150"
                        style={{ backgroundColor: area.color }}
                      />
                      <span className="truncate text-sm">{area.name}</span>
                      <span className="ml-auto font-mono text-[13px] tabular-nums text-muted-foreground">
                        {n}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── Ritmo ──────────────────────────────────────────────── */}
          <section className="enter-soft">
            <SectionHeader
              label="Ritmo"
              count={`${pulse.captured_today} hoje`}
              action={
                pulse.links > 0 ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/mapa">
                      <Link2 />
                      Mapa
                    </Link>
                  </Button>
                ) : undefined
              }
            />
            <div className="panel-flat p-5 md:p-6">
              <ActivityStrip days={activity} />
            </div>
          </section>

          {/* ── Trilhas ────────────────────────────────────────────── */}
          {(tracks ?? []).length > 0 && (
            <section className="enter-up">
              <SectionHeader label="Trilhas em andamento" />

              <div className="stagger space-y-3">
                {(tracks ?? []).map((t, i) => {
                  const topics = (t.track_topics ?? []) as { done: boolean }[];
                  const done = topics.filter((x) => x.done).length;
                  const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;

                  return (
                    <Link
                      key={t.id}
                      href={`/trilhas/${t.id}`}
                      style={{ "--i": i } as React.CSSProperties}
                      className="spotlight lift group block rounded-lg bg-surface p-5 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)] hover:shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.28)]"
                    >
                      <div className="mb-3 flex items-baseline justify-between gap-4">
                        <p className="flex min-w-0 items-center gap-2.5 font-medium">
                          <Compass className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-acid" />
                          <span className="truncate">{t.title}</span>
                        </p>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums tracking-[0.1em] text-muted-foreground">
                          {done}/{topics.length}
                          <span className="ml-2 text-acid">{pct}%</span>
                        </span>
                      </div>
                      <Progress value={pct} />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Chegou por último ──────────────────────────────────── */}
          <section className="enter-up">
            <SectionHeader
              label="Chegou por último"
              action={
                <Button asChild size="sm" variant="ghost">
                  <Link href="/fluxo">
                    <Layers />
                    Fluxo
                  </Link>
                </Button>
              }
            />

            <div className="stagger space-y-3">
              {(recent ?? []).map((item, i) => (
                <ItemCard
                  key={item.id}
                  index={i}
                  item={item as never}
                  area={item.area_id ? areaById.get(item.area_id) : undefined}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
