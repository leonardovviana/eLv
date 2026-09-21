-- ═══════════════════════════════════════════════════════════════════════════
-- eLv — O Ciclo
--
-- A v1 era um depósito: você jogava coisa dentro e nada nunca te trazia de
-- volta. Um segundo cérebro sem loop de retorno é um HD externo com busca.
--
-- Esta migration introduz o ciclo que faltava:
--
--   CAPTAR → DESTILAR → REVISAR → CONECTAR → (volta ao início)
--
-- O que muda no modelo:
--
--   1. Todo item tem ESTÁGIO DE MATURAÇÃO (`stage`), não só um status opaco.
--      semente → broto → crescido → enraizado. O estágio é visível e progride.
--
--   2. Todo item tem FORÇA (`strength`, 0..100) que DECAI com o tempo. É isso
--      que dá vida ao app: o que você não revisita murcha e volta para a fila.
--      A força efetiva (vitalidade) é calculada, nunca armazenada decaída —
--      armazenar exigiria um cron varrendo a tabela inteira todo dia.
--
--   3. REVISÃO ESPAÇADA (SM-2 simplificado) roda no banco, em `register_review`.
--      No servidor porque a nota muda cinco campos de uma vez e grava log:
--      fazer isso em round-trips do cliente abriria janela para estado torto.
--
--   4. CONEXÕES entre itens (`item_links`) deixam de ser tabela morta: ganham
--      origem e score, e o app sugere ligações por proximidade semântica.
--
-- O `status` da v1 continua existindo e é mantido em sincronia por trigger,
-- porque `search_items`, as políticas de RLS e as telas antigas filtram por
-- ele. Quebrar isso aqui significaria reescrever a busca junto — e a busca é
-- a única coisa da v1 que estava certa.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. Colunas do ciclo
-- ---------------------------------------------------------------------------
alter table items add column if not exists stage text not null default 'seed';
alter table items add column if not exists strength int not null default 5;
alter table items add column if not exists ease real not null default 2.5;
alter table items add column if not exists interval_days int not null default 0;
alter table items add column if not exists reviews int not null default 0;
alter table items add column if not exists last_reviewed_at timestamptz;
alter table items add column if not exists next_review_at timestamptz;
alter table items add column if not exists opens int not null default 0;
alter table items add column if not exists last_opened_at timestamptz;

do $$
begin
  alter table items add constraint items_stage_check
    check (stage in ('seed','sprout','grown','rooted','dormant'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table items add constraint items_strength_check
    check (strength between 0 and 100);
exception when duplicate_object then null;
end $$;

-- Backfill do acervo da v1: o status antigo vira o estágio equivalente.
update items set stage = case
  when status = 'inbox'    then 'seed'
  when status = 'archived' then 'dormant'
  else 'sprout'
end
where stage = 'seed' and status <> 'inbox';

-- ---------------------------------------------------------------------------
-- 2. status espelha stage
--
-- Uma fonte de verdade só (`stage`) e um campo derivado mantido por trigger.
-- Sem isso, toda escrita teria que lembrar de atualizar os dois, e o primeiro
-- esquecimento sumiria com o item da busca sem ninguém entender por quê.
-- ---------------------------------------------------------------------------
create or replace function sync_item_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status := case new.stage
    when 'seed'    then 'inbox'
    when 'dormant' then 'archived'
    else 'active'
  end;
  return new;
end;
$$;

drop trigger if exists items_sync_status on items;
create trigger items_sync_status
  before insert or update of stage on items
  for each row execute function sync_item_status();

-- ---------------------------------------------------------------------------
-- 3. Vitalidade — a força depois do esquecimento
--
-- Curva de esquecimento de Ebbinghaus em forma barata: a força decai de modo
-- exponencial no tempo VENCIDO, não no tempo absoluto. Um item revisado ontem
-- com intervalo de 30 dias está 100% vivo; o mesmo item 60 dias depois já
-- perdeu mais da metade.
--
-- Immutable porque só depende dos argumentos — assim pode ser usada em
-- ORDER BY sem o planner reavaliar o custo a cada nó do plano.
-- ---------------------------------------------------------------------------
create or replace function item_vitality(
  p_strength int,
  p_last_reviewed timestamptz,
  p_interval int,
  p_now timestamptz default now()
)
returns int
language sql
immutable
as $$
  select greatest(0, least(100, round(
    p_strength * exp(
      -0.5 * greatest(
        0,
        (extract(epoch from (p_now - coalesce(p_last_reviewed, p_now))) / 86400.0)
          / greatest(coalesce(p_interval, 0), 1) - 1
      )
    )
  )))::int;
$$;

-- ---------------------------------------------------------------------------
-- 4. review_log — cada revisão vira histórico
--
-- Sem log não há gráfico de atividade, não há sequência de dias e não há como
-- saber se a revisão espaçada está funcionando para esta pessoa.
-- ---------------------------------------------------------------------------
create table if not exists review_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  item_id         uuid not null references items(id) on delete cascade,
  grade           text not null check (grade in ('forgot','hard','good','easy')),
  strength_before int  not null default 0,
  strength_after  int  not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists review_log_user_day_idx on review_log (user_id, created_at desc);
create index if not exists review_log_item_idx     on review_log (item_id);

alter table review_log enable row level security;

drop policy if exists own_review_log on review_log;
create policy own_review_log on review_log for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Índice da fila: "o que vence hoje" é a primeira pergunta de toda abertura.
create index if not exists items_due_idx
  on items (user_id, next_review_at)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 5. Conexões com procedência
--
-- `item_links` existia desde a v1 e nunca foi escrita. Agora guarda também DE
-- ONDE veio a ligação: o que a IA sugeriu e você aceitou não tem o mesmo peso
-- do que você ligou na mão.
-- ---------------------------------------------------------------------------
alter table item_links add column if not exists origin text not null default 'manual';
alter table item_links add column if not exists score real not null default 0;
alter table item_links add column if not exists created_at timestamptz not null default now();

do $$
begin
  alter table item_links add constraint item_links_origin_check
    check (origin in ('manual','ai','semantic'));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 6. register_review — a nota vira novo agendamento
--
-- SM-2 enxuto. A diferença para o SM-2 clássico é que aqui a nota move DUAS
-- coisas: o intervalo (quando volta) e a força (quanto o item pesa no pulso).
-- Só o intervalo deixaria o painel estático; só a força deixaria a fila burra.
-- ---------------------------------------------------------------------------
create or replace function register_review(p_item_id uuid, p_grade text)
returns table (
  stage          text,
  strength       int,
  interval_days  int,
  next_review_at timestamptz,
  reviews        int
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  it        items%rowtype;
  new_ease  real;
  new_int   int;
  new_str   int;
  new_stage text;
begin
  if p_grade not in ('forgot','hard','good','easy') then
    raise exception 'Nota inválida: %', p_grade;
  end if;

  select * into it from items where id = p_item_id;
  if not found then
    raise exception 'Item não encontrado.';
  end if;

  -- A força de partida é a VITALIDADE, não o valor guardado: quem revisa algo
  -- meio esquecido não deve herdar a força do dia em que sabia de cor.
  new_str := item_vitality(it.strength, it.last_reviewed_at, it.interval_days);

  case p_grade
    when 'forgot' then
      new_ease := greatest(1.3, it.ease - 0.25);
      new_int  := 1;
      new_str  := greatest(0, new_str - 20);
    when 'hard' then
      new_ease := greatest(1.3, it.ease - 0.1);
      new_int  := greatest(2, ceil(greatest(it.interval_days, 1) * 1.2)::int);
      new_str  := least(100, new_str + 8);
    when 'good' then
      new_ease := it.ease;
      new_int  := case
                    when it.interval_days <= 0 then 3
                    when it.interval_days <= 3 then 7
                    else ceil(it.interval_days * it.ease)::int
                  end;
      new_str  := least(100, new_str + 18);
    else -- easy
      new_ease := least(3.2, it.ease + 0.12);
      new_int  := case
                    when it.interval_days <= 0 then 6
                    else ceil(it.interval_days * it.ease * 1.4)::int
                  end;
      new_str  := least(100, new_str + 28);
  end case;

  new_int := least(new_int, 365);

  -- Promoção de estágio: enraizar exige força E repetição. Um item acertado
  -- uma vez só não está enraizado — foi memória recente, não memória.
  new_stage := case
    when new_str >= 80 and it.reviews + 1 >= 3 then 'rooted'
    when new_str >= 40                          then 'grown'
    else 'sprout'
  end;

  update items set
    stage            = new_stage,
    strength         = new_str,
    ease             = new_ease,
    interval_days    = new_int,
    reviews          = it.reviews + 1,
    last_reviewed_at = now(),
    next_review_at   = now() + make_interval(days => new_int)
  where id = p_item_id;

  insert into review_log (user_id, item_id, grade, strength_before, strength_after)
  values (it.user_id, p_item_id, p_grade, it.strength, new_str);

  return query
    select i.stage, i.strength, i.interval_days, i.next_review_at, i.reviews
    from items i where i.id = p_item_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. due_queue — o que pede atenção agora
--
-- Ordem por urgência, não por data crua: um item fraco vencido há uma semana
-- passa na frente de um forte vencido ontem.
-- ---------------------------------------------------------------------------
create or replace function due_queue(p_limit int default 12)
returns table (
  id            uuid,
  area_id       uuid,
  kind          text,
  title         text,
  summary       text,
  why_useful    text,
  url           text,
  content       text,
  stage         text,
  strength      int,
  vitality      int,
  reviews       int,
  interval_days int,
  days_overdue  real
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    i.id, i.area_id, i.kind, i.title, i.summary, i.why_useful, i.url, i.content,
    i.stage, i.strength,
    item_vitality(i.strength, i.last_reviewed_at, i.interval_days) as vitality,
    i.reviews, i.interval_days,
    (extract(epoch from (now() - i.next_review_at)) / 86400.0)::real as days_overdue
  from items i
  where i.user_id = (select auth.uid())
    and i.stage in ('sprout','grown','rooted')
    and i.next_review_at is not null
    and i.next_review_at <= now()
  order by
    (extract(epoch from (now() - i.next_review_at)) / 86400.0)
      * (101 - item_vitality(i.strength, i.last_reviewed_at, i.interval_days)) desc
  limit greatest(1, least(p_limit, 50));
$$;

-- ---------------------------------------------------------------------------
-- 8. brain_pulse — o estado do cérebro num objeto só
--
-- A home antiga disparava seis consultas e ainda assim não dizia nada. Aqui
-- tudo que o painel precisa vem numa ida ao banco: contagens por estágio,
-- fila do dia, atividade, sequência e vitalidade média.
-- ---------------------------------------------------------------------------
create or replace function brain_pulse()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with uid as (select (select auth.uid()) as id),
  mine as (
    select i.*, item_vitality(i.strength, i.last_reviewed_at, i.interval_days) as vitality
    from items i, uid
    where i.user_id = uid.id
  ),
  live as (select * from mine where stage <> 'dormant'),
  -- Dias em que houve qualquer sinal de vida: captura ou revisão.
  active_days as (
    select distinct d::date as d from (
      select created_at as d from mine
      union all
      select r.created_at from review_log r, uid where r.user_id = uid.id
    ) x
  ),
  -- Sequência: conta para trás a partir de hoje. Se hoje ainda está em branco,
  -- a contagem começa em ontem — a sequência só quebra quando um dia INTEIRO
  -- passa sem nada, não às 00h01 de quem ainda vai usar o app hoje.
  ranked as (
    select d, row_number() over (order by d desc) as rn
    from active_days where d <= current_date
  ),
  streak as (
    select count(*)::int as days from ranked
    where d = current_date - (rn - 1)::int
       or (d = current_date - rn::int
           and not exists (select 1 from active_days where d = current_date))
  )
  select jsonb_build_object(
    'total',          (select count(*) from live),
    'seeds',          (select count(*) from live where stage = 'seed'),
    'sprouts',        (select count(*) from live where stage = 'sprout'),
    'grown',          (select count(*) from live where stage = 'grown'),
    'rooted',         (select count(*) from live where stage = 'rooted'),
    'dormant',        (select count(*) from mine where stage = 'dormant'),
    'due',            (select count(*) from live
                        where stage <> 'seed' and next_review_at is not null
                          and next_review_at <= now()),
    'due_soon',       (select count(*) from live
                        where stage <> 'seed' and next_review_at > now()
                          and next_review_at <= now() + interval '3 days'),
    'vitality',       (select coalesce(round(avg(vitality)), 0)::int from live where stage <> 'seed'),
    'unindexed',      (select count(*) from live where content_hash is null),
    'captured_today', (select count(*) from mine where created_at >= current_date),
    'reviewed_today', (select count(*) from review_log r, uid
                        where r.user_id = uid.id and r.created_at >= current_date),
    'links',          (select count(*) from item_links l
                        join items i on i.id = l.from_item_id, uid
                        where i.user_id = uid.id),
    'areas',          (select count(*) from areas a, uid where a.user_id = uid.id),
    'tracks',         (select count(*) from tracks t, uid
                        where t.user_id = uid.id and t.status = 'active'),
    'streak',         (select days from streak)
  );
$$;

-- ---------------------------------------------------------------------------
-- 9. activity_days — matéria-prima do gráfico de pulso
-- ---------------------------------------------------------------------------
create or replace function activity_days(p_days int default 28)
returns table (day date, captures int, reviews int)
language sql
stable
security invoker
set search_path = public
as $$
  with uid as (select (select auth.uid()) as id),
  span as (
    select generate_series(
      current_date - (greatest(1, least(p_days, 180)) - 1),
      current_date,
      interval '1 day'
    )::date as day
  )
  select
    s.day,
    (select count(*)::int from items i, uid
      where i.user_id = uid.id and i.created_at::date = s.day),
    (select count(*)::int from review_log r, uid
      where r.user_id = uid.id and r.created_at::date = s.day)
  from span s
  order by s.day;
$$;

-- ---------------------------------------------------------------------------
-- 10. suggest_links — ligações que o acervo já sugere sozinho
--
-- Pares semanticamente próximos que ainda não estão ligados. O par é
-- normalizado (menor id primeiro) para "A–B" e "B–A" não virarem duas
-- sugestões da mesma coisa.
-- ---------------------------------------------------------------------------
create or replace function suggest_links(p_limit int default 8)
returns table (
  a_id    uuid,
  a_title text,
  a_kind  text,
  b_id    uuid,
  b_title text,
  b_kind  text,
  score   real
)
language sql
stable
security invoker
set search_path = public
as $$
  with uid as (select (select auth.uid()) as id),
  centroids as (
    select c.item_id, avg(c.embedding)::vector(768) as v
    from item_chunks c, uid
    where c.user_id = uid.id
    group by c.item_id
  ),
  pairs as (
    select
      least(x.item_id, y.item_id)    as a_id,
      greatest(x.item_id, y.item_id) as b_id,
      (1 - (x.v <=> y.v))::real      as score
    from centroids x
    join centroids y on y.item_id > x.item_id
    where (1 - (x.v <=> y.v)) > 0.62
  )
  select p.a_id, ia.title, ia.kind, p.b_id, ib.title, ib.kind, p.score
  from pairs p
  join items ia on ia.id = p.a_id
  join items ib on ib.id = p.b_id
  where ia.status <> 'archived' and ib.status <> 'archived'
    and not exists (
      select 1 from item_links l
      where (l.from_item_id = p.a_id and l.to_item_id = p.b_id)
         or (l.from_item_id = p.b_id and l.to_item_id = p.a_id)
    )
  order by p.score desc
  limit greatest(1, least(p_limit, 30));
$$;

-- ---------------------------------------------------------------------------
-- 11. brain_map — nós e arestas da constelação
--
-- Devolve um objeto só: o canvas precisa dos dois lados juntos, e duas
-- chamadas separadas podem chegar em estados diferentes.
-- ---------------------------------------------------------------------------
create or replace function brain_map(p_limit int default 120)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with uid as (select (select auth.uid()) as id),
  nodes as (
    select
      i.id, i.title, i.kind, i.stage, i.area_id,
      item_vitality(i.strength, i.last_reviewed_at, i.interval_days) as vitality
    from items i, uid
    where i.user_id = uid.id and i.stage <> 'dormant'
    order by i.updated_at desc
    limit greatest(10, least(p_limit, 400))
  )
  select jsonb_build_object(
    'nodes', coalesce((select jsonb_agg(to_jsonb(n)) from nodes n), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'a', l.from_item_id, 'b', l.to_item_id, 'origin', l.origin, 'score', l.score
      ))
      from item_links l
      where l.from_item_id in (select id from nodes)
        and l.to_item_id   in (select id from nodes)
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- 12. Grants
--
-- O Supabase concede execute a anon/authenticated em toda função nova do
-- schema public via ALTER DEFAULT PRIVILEGES, e `create or replace` restaura
-- esse padrão. Nenhuma destas precisa ser alcançável sem sessão.
-- ---------------------------------------------------------------------------
revoke execute on function register_review(uuid, text)                       from anon, public;
revoke execute on function due_queue(int)                                    from anon, public;
revoke execute on function brain_pulse()                                     from anon, public;
revoke execute on function activity_days(int)                                from anon, public;
revoke execute on function suggest_links(int)                                from anon, public;
revoke execute on function brain_map(int)                                    from anon, public;
revoke execute on function item_vitality(int, timestamptz, int, timestamptz) from anon, public;
revoke execute on function sync_item_status()                                from anon, authenticated, public;

grant execute on function register_review(uuid, text)                        to authenticated;
grant execute on function due_queue(int)                                     to authenticated;
grant execute on function brain_pulse()                                      to authenticated;
grant execute on function activity_days(int)                                 to authenticated;
grant execute on function suggest_links(int)                                 to authenticated;
grant execute on function brain_map(int)                                     to authenticated;
grant execute on function item_vitality(int, timestamptz, int, timestamptz)  to authenticated;
