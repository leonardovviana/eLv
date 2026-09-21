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
