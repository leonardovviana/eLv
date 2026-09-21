-- eLv — Segundo Cérebro: schema completo.
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode.
-- Fonte: supabase/migrations/. Não edite aqui — edite as migrations e regenere.

------------------------------------------------------------------------------
-- 0001_init.sql — tabelas, RLS, índices, busca híbrida, áreas padrão
------------------------------------------------------------------------------

-- eLv — Segundo Cérebro
-- Schema inicial: áreas, itens (unidade universal), tags, links, embeddings,
-- trilhas de estudo e log de uso da IA.

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- areas
-- ---------------------------------------------------------------------------
create table areas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  slug        text not null,
  color       text not null default '#7c3aed',
  icon        text not null default 'folder',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, slug)
);

-- ---------------------------------------------------------------------------
-- items — a unidade universal do segundo cérebro.
-- Um repo do GitHub, um prompt salvo e uma ideia solta são todos itens;
-- o que muda é `kind` e o que vai em `source_meta`.
-- ---------------------------------------------------------------------------
create table items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  area_id     uuid references areas(id) on delete set null,   -- null = Inbox
  kind        text not null default 'note'
              check (kind in ('note','link','snippet','repo','prompt','idea')),
  title       text not null default '',
  content     text not null default '',                       -- markdown
  url         text,
  source_meta jsonb not null default '{}'::jsonb,             -- stars, lang, autor...
  summary     text,                                           -- gerado pela IA
  why_useful  text,                                           -- gerado pela IA
  status      text not null default 'inbox'
              check (status in ('inbox','active','archived')),
  pinned      boolean not null default false,
  content_hash text,                                          -- evita re-embeddar à toa
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  fts tsvector generated always as (
    to_tsvector(
      'portuguese',
      coalesce(title,'') || ' ' ||
      coalesce(content,'') || ' ' ||
      coalesce(summary,'') || ' ' ||
      coalesce(why_useful,'')
    )
  ) stored
);

create trigger items_updated_at
  before update on items
  for each row execute function set_updated_at();

create index items_fts_idx          on items using gin (fts);
create index items_user_status_idx  on items (user_id, status, updated_at desc);
create index items_user_area_idx    on items (user_id, area_id);
create index items_title_trgm_idx   on items using gin (title gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- tags (livres) + N:N
-- ---------------------------------------------------------------------------
create table tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name    text not null,
  slug    text not null,
  unique (user_id, slug)
);

create table item_tags (
  item_id uuid not null references items(id) on delete cascade,
  tag_id  uuid not null references tags(id)  on delete cascade,
  primary key (item_id, tag_id)
);

create index item_tags_tag_idx on item_tags (tag_id);

-- ---------------------------------------------------------------------------
-- item_links — wikilinks [[...]] entre notas. Base do grafo (v2).
-- ---------------------------------------------------------------------------
create table item_links (
  from_item_id uuid not null references items(id) on delete cascade,
  to_item_id   uuid not null references items(id) on delete cascade,
  primary key (from_item_id, to_item_id),
  check (from_item_id <> to_item_id)
);

create index item_links_to_idx on item_links (to_item_id);

-- ---------------------------------------------------------------------------
-- item_chunks — embeddings. 768 dims porque o índice HNSW do pgvector
-- não aceita mais de 2000, e porque é uma das dimensões recomendadas.
-- O vetor chega aqui JÁ normalizado L2 pelo servidor.
-- ---------------------------------------------------------------------------
create table item_chunks (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  chunk_index int  not null,
  content     text not null,
  embedding   vector(768) not null,
  created_at  timestamptz not null default now(),
  unique (item_id, chunk_index)
);

create index item_chunks_embedding_idx
  on item_chunks using hnsw (embedding vector_cosine_ops);
create index item_chunks_user_idx on item_chunks (user_id);

-- ---------------------------------------------------------------------------
-- trilhas de estudo
-- ---------------------------------------------------------------------------
create table tracks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  area_id     uuid references areas(id) on delete set null,
  title       text not null,
  description text not null default '',
  status      text not null default 'active'
              check (status in ('active','done','paused')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger tracks_updated_at
  before update on tracks
  for each row execute function set_updated_at();

create table track_topics (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid not null references tracks(id) on delete cascade,
  title      text not null,
  notes      text not null default '',
  done       boolean not null default false,
  sort_order int not null default 0,
  item_id    uuid references items(id) on delete set null,
  created_at timestamptz not null default now()
);

create index track_topics_track_idx on track_topics (track_id, sort_order);

-- ---------------------------------------------------------------------------
-- ai_runs — toda chamada ao Gemini passa por aqui.
-- É o que alimenta o contador de uso do dia na UI, já que o free tier
-- é apertado e o Google não expõe o saldo por API.
-- ---------------------------------------------------------------------------
create table ai_runs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  model      text not null,
  ok         boolean not null default true,
  error      text,
  created_at timestamptz not null default now()
);

create index ai_runs_user_day_idx on ai_runs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — tudo privado por user_id.
-- ---------------------------------------------------------------------------
alter table areas        enable row level security;
alter table items        enable row level security;
alter table tags         enable row level security;
alter table item_tags    enable row level security;
alter table item_links   enable row level security;
alter table item_chunks  enable row level security;
alter table tracks       enable row level security;
alter table track_topics enable row level security;
alter table ai_runs      enable row level security;

create policy own_areas       on areas       for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_items       on items       for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_tags        on tags        for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_chunks      on item_chunks for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_tracks      on tracks      for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_ai_runs     on ai_runs     for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Tabelas de junção não têm user_id: validam pela tabela dona.
create policy own_item_tags on item_tags for all
  using (exists (select 1 from items i where i.id = item_id and i.user_id = (select auth.uid())))
  with check (exists (select 1 from items i where i.id = item_id and i.user_id = (select auth.uid())));

create policy own_item_links on item_links for all
  using (exists (select 1 from items i where i.id = from_item_id and i.user_id = (select auth.uid())))
  with check (exists (select 1 from items i where i.id = from_item_id and i.user_id = (select auth.uid())));

create policy own_track_topics on track_topics for all
  using (exists (select 1 from tracks t where t.id = track_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from tracks t where t.id = track_id and t.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- search_items — busca híbrida full-text + semântica, fundida com
-- Reciprocal Rank Fusion (k = 60).
--
-- Por que RRF e não média ponderada: ts_rank_cd e distância de cosseno vivem
-- em escalas incomparáveis. Somar os dois direto faz uma das buscas dominar a
-- outra de forma arbitrária. RRF usa só a POSIÇÃO em cada lista, então funde
-- sem precisar calibrar nada.
--
-- q_embedding pode ser NULL (quota do Gemini estourada) → cai para full-text
-- puro sem quebrar. É isso que mantém a busca sempre viva.
-- ---------------------------------------------------------------------------
create or replace function search_items(
  q            text        default null,
  q_embedding  vector(768) default null,
  match_count  int         default 20,
  p_area_id    uuid        default null,
  p_kind       text        default null
)
returns table (
  id          uuid,
  area_id     uuid,
  kind        text,
  title       text,
  summary     text,
  why_useful  text,
  url         text,
  source_meta jsonb,
  status      text,
  updated_at  timestamptz,
  score       real
)
language sql
stable
security invoker
set search_path = public
as $$
  with
  params as (
    select
      nullif(btrim(coalesce(q, '')), '') as term,
      (select auth.uid())                as uid
  ),
  fts as (
    select
      i.id,
      row_number() over (
        order by ts_rank_cd(i.fts, websearch_to_tsquery('portuguese', p.term)) desc, i.updated_at desc
      ) as rank
    from items i, params p
    where p.term is not null
      and i.user_id = p.uid
      and i.status <> 'archived'
      and i.fts @@ websearch_to_tsquery('portuguese', p.term)
      and (p_area_id is null or i.area_id = p_area_id)
      and (p_kind    is null or i.kind    = p_kind)
    limit match_count * 3
  ),
  sem as (
    select
      c.item_id as id,
      row_number() over (order by min(c.embedding <=> q_embedding)) as rank
    from item_chunks c
    join items i on i.id = c.item_id
    cross join params p
    where q_embedding is not null
      and c.user_id = p.uid
      and i.status <> 'archived'
      and (p_area_id is null or i.area_id = p_area_id)
      and (p_kind    is null or i.kind    = p_kind)
    group by c.item_id
    limit match_count * 3
  ),
  fused as (
    select
      coalesce(f.id, s.id) as id,
      (coalesce(1.0 / (60 + f.rank), 0) + coalesce(1.0 / (60 + s.rank), 0))::real as score
    from fts f
    full outer join sem s on f.id = s.id
  )
  select
    i.id, i.area_id, i.kind, i.title, i.summary, i.why_useful,
    i.url, i.source_meta, i.status, i.updated_at, x.score
  from fused x
  join items i on i.id = x.id
  order by x.score desc, i.updated_at desc
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- related_items — "veja também" por similaridade semântica pura.
-- Usa o centroide dos chunks do item como consulta.
-- ---------------------------------------------------------------------------
create or replace function related_items(
  p_item_id   uuid,
  match_count int default 6
)
returns table (
  id         uuid,
  title      text,
  kind       text,
  area_id    uuid,
  summary    text,
  similarity real
)
language sql
stable
security invoker
set search_path = public
as $$
  with src as (
    select avg(embedding)::vector(768) as centroid
    from item_chunks
    where item_id = p_item_id and user_id = (select auth.uid())
  )
  select
    i.id, i.title, i.kind, i.area_id, i.summary,
    (1 - min(c.embedding <=> src.centroid))::real as similarity
  from item_chunks c
  join items i on i.id = c.item_id
  cross join src
  where src.centroid is not null
    and c.user_id = (select auth.uid())
    and c.item_id <> p_item_id
    and i.status <> 'archived'
  group by i.id, i.title, i.kind, i.area_id, i.summary
  order by similarity desc
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Áreas padrão.
--
-- Duas portas de entrada de propósito:
--
--   1. ensure_default_areas() — idempotente, chamada pelo app quando encontra
--      um usuário sem nenhuma área. É o caminho confiável.
--   2. O trigger em auth.users, para quem cria a conta depois da migration.
--
-- O trigger é conveniência, não garantia: criar trigger em auth.users depende
-- de permissão que nem todo projeto concede, e ele não alcança contas criadas
-- ANTES desta migration rodar. Por isso o app não depende dele.
-- ---------------------------------------------------------------------------
create or replace function ensure_default_areas(p_user_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := coalesce(p_user_id, (select auth.uid()));
  inserted int  := 0;
begin
  if uid is null then
    raise exception 'Sem usuário.';
  end if;

  insert into areas (user_id, name, slug, color, icon, sort_order) values
    (uid, 'IA',        'ia',        '#7c3aed', 'sparkles',   1),
    (uid, 'Agentic',   'agentic',   '#0ea5e9', 'bot',        2),
    (uid, 'Coding',    'coding',    '#22c55e', 'code',       3),
    (uid, 'DevOps',    'devops',    '#f59e0b', 'server',     4),
    (uid, 'Produto',   'produto',   '#ec4899', 'lightbulb',  5),
    (uid, 'Carreira',  'carreira',  '#64748b', 'briefcase',  6)
  on conflict (user_id, slug) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Só o dono da conta pode semear as próprias áreas.
revoke all on function ensure_default_areas(uuid) from public;
grant execute on function ensure_default_areas(uuid) to authenticated;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform ensure_default_areas(new.id);
  return new;
end;
$$;

-- Envolto em bloco: se o projeto não permitir trigger em auth.users, a
-- migration inteira não pode falhar por causa disso — ensure_default_areas()
-- cobre o caso de qualquer jeito.
do $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();
exception
  when insufficient_privilege then
    raise notice 'Sem permissão para criar trigger em auth.users — o app usa ensure_default_areas() no primeiro login.';
end;
$$;

-- Popula quem já tinha conta antes desta migration.
do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform ensure_default_areas(u.id);
  end loop;
exception
  when insufficient_privilege then
    raise notice 'Sem leitura de auth.users — as áreas nascem no primeiro login.';
end;
$$;

------------------------------------------------------------------------------
-- 0002_seed_starter.sql — função dos 10 repositórios de partida
------------------------------------------------------------------------------

-- Conteúdo de partida: 10 repositórios para o app não nascer vazio.
--
-- Isto é CONTEÚDO, não um módulo: cada repo é um item comum (kind = 'repo'),
-- indistinguível de qualquer coisa que você capture depois. Serve para você
-- ter com o que testar a busca no primeiro dia.
--
-- Os metadados (stars, linguagem) NÃO vão aqui de propósito: ficariam
-- desatualizados na hora. Abra o item e use "Reextrair com IA" — ele busca os
-- números atuais na API pública do GitHub.

create or replace function seed_starter_repos()
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid      uuid := (select auth.uid());
  a_ia      uuid;
  a_agentic uuid;
  a_coding  uuid;
  inserted  int  := 0;
begin
  if uid is null then
    raise exception 'Sem usuário autenticado.';
  end if;

  select id into a_ia      from areas where user_id = uid and slug = 'ia';
  select id into a_agentic from areas where user_id = uid and slug = 'agentic';
  select id into a_coding  from areas where user_id = uid and slug = 'coding';

  with starter (title, url, area_id, summary, why_useful, tags) as (
    values
      (
        'Vercel AI SDK',
        'https://github.com/vercel/ai',
        a_ia,
        'Toolkit TypeScript para apps de IA: streaming de respostas, tool calling e hooks de UI, com um provider único para Gemini, Claude, OpenAI e outros.',
        'Serve quando você quiser trocar de modelo sem reescrever o app, ou colocar streaming de verdade num projeto Next.js.',
        array['typescript','next','llm','streaming']
      ),
      (
        'LangGraph',
        'https://github.com/langchain-ai/langgraph',
        a_agentic,
        'Orquestração de agentes como grafo de estado, com ciclos, checkpoints e retomada de execução.',
        'Serve quando o agente precisa de mais de uma volta, decidir caminho e sobreviver a uma falha no meio, em vez de uma chamada só.',
        array['agentes','orquestracao','python','estado']
      ),
      (
        'MCP — servidores de referência',
        'https://github.com/modelcontextprotocol/servers',
        a_agentic,
        'Implementações oficiais de servidores do Model Context Protocol: sistema de arquivos, git, banco de dados, busca e outros.',
        'Serve como molde quando você for expor uma ferramenta sua para um agente, em vez de inventar o protocolo do zero.',
        array['mcp','ferramentas','protocolo','integracao']
      ),
      (
        'CrewAI',
        'https://github.com/crewAIInc/crewAI',
        a_agentic,
        'Framework para montar times de agentes com papéis, objetivos e delegação entre eles.',
        'Serve quando a tarefa se divide naturalmente em papéis — um pesquisa, outro escreve, outro revisa.',
        array['multiagente','python','automacao']
      ),
      (
        'browser-use',
        'https://github.com/browser-use/browser-use',
        a_agentic,
        'Faz um LLM controlar o navegador de verdade: navega, clica, preenche formulário e lê a página.',
        'Serve para automatizar o que só existe atrás de uma interface web, sem API pública para chamar.',
        array['browser','automacao','scraping','agentes']
      ),
      (
        'pgvector',
        'https://github.com/pgvector/pgvector',
        a_ia,
        'Extensão do Postgres para vetores: armazena embeddings e faz busca por similaridade com índices HNSW e IVFFlat.',
        'É exatamente o que faz a busca semântica deste app funcionar. Serve sempre que você quiser RAG sem subir um banco vetorial separado.',
        array['postgres','embeddings','rag','supabase']
      ),
      (
        'LlamaIndex',
        'https://github.com/run-llama/llama_index',
        a_ia,
        'Framework de RAG: ingestão de documentos, chunking, indexação e recuperação, com muitos conectores prontos.',
        'Serve quando o RAG passar de um chunking simples e você precisar de ingestão de PDF, planilha e API sem escrever cada parser.',
        array['rag','indexacao','python','documentos']
      ),
      (
        'AutoGen',
        'https://github.com/microsoft/autogen',
        a_agentic,
        'Framework da Microsoft para agentes que conversam entre si, com execução de código e humano no circuito.',
        'Serve quando você quiser comparar uma abordagem conversacional de multiagente com a do CrewAI antes de escolher.',
        array['multiagente','microsoft','python']
      ),
      (
        'LibreChat',
        'https://github.com/danny-avila/LibreChat',
        a_ia,
        'Interface de chat self-hosted que fala com vários provedores, com histórico, presets, plugins e multiusuário.',
        'Serve como referência de arquitetura de chat multi-provider — ou para subir a sua própria e parar de pagar assinatura.',
        array['chat','selfhost','interface','multiprovider']
      ),
      (
        'shadcn/ui',
        'https://github.com/shadcn-ui/ui',
        a_coding,
        'Componentes React acessíveis sobre Radix e Tailwind, copiados para dentro do projeto em vez de instalados como dependência.',
        'É a base da interface deste app. Serve toda vez que você precisar de um componente novo com o mesmo visual do resto.',
        array['react','tailwind','ui','radix']
      )
  )
  insert into items (user_id, area_id, kind, title, url, summary, why_useful, status)
  select uid, s.area_id, 'repo', s.title, s.url, s.summary, s.why_useful, 'active'
  from starter s
  where not exists (
    select 1 from items i where i.user_id = uid and i.url = s.url
  );

  get diagnostics inserted = row_count;

  -- Tags: criadas e ligadas aos itens recém-inseridos.
  with starter (url, tags) as (
    values
      ('https://github.com/vercel/ai',                        array['typescript','next','llm','streaming']),
      ('https://github.com/langchain-ai/langgraph',            array['agentes','orquestracao','python','estado']),
      ('https://github.com/modelcontextprotocol/servers',      array['mcp','ferramentas','protocolo','integracao']),
      ('https://github.com/crewAIInc/crewAI',                  array['multiagente','python','automacao']),
      ('https://github.com/browser-use/browser-use',           array['browser','automacao','scraping','agentes']),
      ('https://github.com/pgvector/pgvector',                 array['postgres','embeddings','rag','supabase']),
      ('https://github.com/run-llama/llama_index',             array['rag','indexacao','python','documentos']),
      ('https://github.com/microsoft/autogen',                 array['multiagente','microsoft','python']),
      ('https://github.com/danny-avila/LibreChat',             array['chat','selfhost','interface','multiprovider']),
      ('https://github.com/shadcn-ui/ui',                      array['react','tailwind','ui','radix'])
  ),
  flat as (
    select s.url, unnest(s.tags) as tag from starter s
  ),
  upserted as (
    insert into tags (user_id, name, slug)
    select distinct uid, f.tag, f.tag from flat f
    on conflict (user_id, slug) do update set name = excluded.name
    returning id, slug
  )
  insert into item_tags (item_id, tag_id)
  select i.id, u.id
  from flat f
  join items i on i.user_id = uid and i.url = f.url
  join upserted u on u.slug = f.tag
  on conflict do nothing;

  return inserted;
end;
$$;

------------------------------------------------------------------------------
-- 0003_harden_grants.sql — revoga grants padrão de anon/public nas funções
------------------------------------------------------------------------------

-- Endurecimento apontado pelos advisors do Supabase depois de aplicar 0001/0002.
--
-- O `revoke all on function ... from public` da 0001 NÃO bastou. O Supabase
-- concede execute em funções novas do schema public para anon/authenticated
-- via ALTER DEFAULT PRIVILEGES: esses grants pertencem ao ROLE, não ao PUBLIC,
-- então sobrevivem a um revoke feito só em PUBLIC. É preciso revogar de cada
-- role nominalmente, e refazer isso depois de todo `create or replace`, que
-- restaura os grants padrão.

-- ensure_default_areas é SECURITY DEFINER e aceita um user_id arbitrário.
-- Exposta a anon em /rest/v1/rpc/, deixaria qualquer um de posse da anon key
-- (que é pública por natureza, vai no bundle do browser) criar áreas em contas
-- alheias.
revoke execute on function ensure_default_areas(uuid) from anon;

-- Defesa em profundidade: mesmo autenticado, ninguém semeia áreas de outro.
-- O trigger em auth.users continua funcionando porque roda como owner, num
-- contexto em que auth.uid() é nulo.
create or replace function ensure_default_areas(p_user_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  caller   uuid := (select auth.uid());
  uid      uuid := coalesce(p_user_id, caller);
  inserted int  := 0;
begin
  if uid is null then
    raise exception 'Sem usuário.';
  end if;

  if caller is not null and uid <> caller then
    raise exception 'Não é possível semear áreas de outro usuário.';
  end if;

  insert into areas (user_id, name, slug, color, icon, sort_order) values
    (uid, 'IA',        'ia',        '#7c3aed', 'sparkles',   1),
    (uid, 'Agentic',   'agentic',   '#0ea5e9', 'bot',        2),
    (uid, 'Coding',    'coding',    '#22c55e', 'code',       3),
    (uid, 'DevOps',    'devops',    '#f59e0b', 'server',     4),
    (uid, 'Produto',   'produto',   '#ec4899', 'lightbulb',  5),
    (uid, 'Carreira',  'carreira',  '#64748b', 'briefcase',  6)
  on conflict (user_id, slug) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke execute on function ensure_default_areas(uuid) from anon, public;
grant  execute on function ensure_default_areas(uuid) to authenticated;

-- handle_new_user é função de TRIGGER. Chamá-la por RPC sempre falha, mas não
-- há motivo para ela aparecer na API.
revoke execute on function handle_new_user() from anon, authenticated, public;

-- search_path fixo: sem isso a resolução de nomes depende do role que chama.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- seed_starter_repos escreve itens. Revogar de anon não basta: o Postgres
-- concede execute a PUBLIC por padrão, e é por esse caminho que anon entrava.
revoke execute on function seed_starter_repos() from public, anon;
grant  execute on function seed_starter_repos() to authenticated;
