import { LoginForm } from "@/components/login-form";
import { Monogram } from "@/components/app-nav";

const CYCLE = [
  ["Captar", "Cola link, código, prompt ou ideia solta. Sem categoria, sem atrito."],
  ["Destilar", "A IA resume e categoriza o lote inteiro numa chamada só."],
  ["Revisar", "O que você guardou volta antes de você esquecer, e fica mais forte."],
  ["Conectar", "O acervo mostra o que tem a ver com o quê. É aí que vira repertório."],
];

/**
 * `next` é lido aqui no servidor e passado como prop.
 *
 * Fazer isso com useSearchParams no cliente obrigaria a um Suspense, e o
 * HTML inicial do login sairia como esqueleto — um flash feio bem na primeira
 * tela que a pessoa vê.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* ── Manifesto ──────────────────────────────────────────────── */}
      <section className="relative hidden flex-col justify-between p-12 shadow-[inset_-1px_0_0_0_hsl(0_0%_100%/0.06)] lg:flex xl:p-16">
        <div className="flex items-center gap-3">
          <Monogram />
          <span className="font-display text-2xl leading-none tracking-tightest">eLv</span>
        </div>

        <div className="max-w-lg">
          <h1 className="display text-balance">
            Você guarda.<br />
            Ele <span className="text-acid">lembra</span>.
          </h1>
          <p className="mt-6 max-w-md text-pretty leading-relaxed text-muted-foreground">
            Um repertório pessoal de IA, coding e agentic. Você joga qualquer coisa dentro e
            reencontra meses depois, mesmo sem lembrar a palavra exata que usou.
          </p>
        </div>

        {/* O ciclo em quatro passos. Sem numeração: a ordem já está na
            sequência, e "01 / 02 / 03" só repetia o que a lista diz. */}
        <dl className="max-w-md space-y-px overflow-hidden rounded-lg bg-[hsl(0_0%_100%/0.07)]">
          {CYCLE.map(([title, text]) => (
            <div
              key={title}
              className="flex items-baseline gap-4 bg-[hsl(var(--surface)/0.6)] p-4 backdrop-blur-sm"
            >
              <dt className="w-20 shrink-0 font-display text-base font-semibold tracking-[-0.02em] text-acid">
                {title}
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Acesso ─────────────────────────────────────────────────── */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex flex-col items-center text-center lg:hidden">
            <Monogram className="h-12 w-12" />
            <h1 className="mt-5 font-display text-4xl leading-none tracking-tightest">eLv</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Seu segundo cérebro para IA, coding e agentic.
            </p>
          </div>

          <div className="mb-6 hidden lg:block">
            <h2 className="display-sm">Acesso</h2>
          </div>

          <LoginForm next={next} />
        </div>
      </section>
    </main>
  );
}
