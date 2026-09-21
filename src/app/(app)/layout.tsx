import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Settings } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { getPulse } from "@/lib/brain";
import { BottomNav, Monogram, SidebarNav } from "@/components/app-nav";
import { CommandBar } from "@/components/command-bar";
import { IdleDream } from "@/components/idle-dream";
import { PageTransition } from "@/components/route-transition";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Rede de segurança: se o trigger em auth.users não rodou — por falta de
  // permissão no projeto, ou porque a conta já existia antes da migration —
  // o app nasceria sem nenhuma área e nada seria categorizável. A função é
  // idempotente, então este caminho só faz trabalho uma vez.
  const { count: areaCount } = await supabase
    .from("areas")
    .select("id", { count: "exact", head: true });

  if ((areaCount ?? 0) === 0) {
    await supabase.rpc("ensure_default_areas", { p_user_id: user.id });
  }

  // O pulso alimenta os contadores da navegação em TODA tela: é o que deixa
  // o trabalho acumulado visível sem precisar entrar nele.
  const pulse = await getPulse(supabase);

  // Matéria-prima do modo sonho. Só itens com "serve para" escrito: sem isso
  // o fragmento apareceria como um título solto, que não lembra nada.
  const { data: dreamRows } = await supabase
    .from("items")
    .select("id, title, why_useful, stage")
    .not("why_useful", "is", null)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(24);

  const fragments = (dreamRows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    why: r.why_useful,
    stage: r.stage,
  }));

  // A navegação mostra estado vivo, não só destinos: contadores, força do
  // cérebro e sequência de dias vêm do mesmo pulso que alimenta a home.
  const navState = {
    seeds: pulse.seeds,
    due: pulse.due,
    vitality: pulse.vitality,
    streak: pulse.streak,
  };

  return (
    <div className="flex min-h-dvh">
      <SidebarNav state={navState} />

      <div className="min-w-0 flex-1">
        {/* No mobile a sidebar some, então a marca e os atalhos de borda
            precisam de um lugar próprio. */}
        <header className="glass sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 shadow-[inset_0_-1px_0_0_hsl(0_0%_100%/0.06)] md:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Monogram className="h-8 w-8" />
            <span className="font-display text-xl leading-none tracking-tightest">eLv</span>
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            {pulse.due > 0 && (
              <Link
                href="/revisar"
                className="mr-1 flex items-center gap-1.5 rounded-[3px] bg-[hsl(var(--acid)/0.12)] px-2 py-1 datum text-acid shadow-[inset_0_0_0_1px_hsl(var(--acid)/0.28)]"
              >
                <span className="tabular-nums">{pulse.due}</span> revisar
              </Link>
            )}

            <Link
              href="/buscar"
              aria-label="Buscar"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              <Search className="h-4 w-4" />
            </Link>

            <Link
              href="/config"
              aria-label="Configurações"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <main className="pb-dock mx-auto w-full max-w-5xl px-4 pt-7 sm:px-5 md:px-10 md:pb-24 md:pt-14">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <BottomNav state={navState} />
      <CommandBar />
      <IdleDream fragments={fragments} />
    </div>
  );
}
