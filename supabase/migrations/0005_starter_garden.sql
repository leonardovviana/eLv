-- ═══════════════════════════════════════════════════════════════════════════
-- eLv — Jardim inicial
--
-- Um segundo cérebro vazio não é "um app limpo", é um app que não faz nada.
-- Sem itens não há fila, não há pulso, não há mapa, não há revisão: todas as
-- telas viram cartão de estado vazio e a pessoa nunca chega a ver o produto.
--
-- `plant_starter_garden()` planta um acervo REAL — coisas que um dev de IA de
-- fato guardaria — já distribuído pelos estágios do ciclo:
--
--   · algumas SEMENTES cruas, para a tela de destilar ter o que destilar;
--   · BROTOS e itens CRESCIDOS com revisão vencida, para a fila do dia existir;
--   · itens ENRAIZADOS com histórico, para o pulso não nascer em zero;
--   · conexões entre itens, para o mapa ter arestas;
--   · uma trilha em andamento.
--
-- A substituição de `seed_starter_repos` (migration 0002) é proposital: dez
-- links todos no mesmo estágio enchiam a lista sem exercitar nada do ciclo.
--
-- Idempotente: reconhece o que já plantou pelo par (user_id, title) e não
-- duplica. Rodar de novo só preenche o que falta.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function plant_starter_garden()
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid       uuid := (select auth.uid());
  planted   int  := 0;
  new_id    uuid;
  ids       uuid[] := '{}';
  track_id  uuid;
  rec       record;
begin
  if uid is null then
    raise exception 'Sem usuário.';
  end if;

  -- Garante as áreas antes de plantar: item sem área nasceria órfão.
  perform ensure_default_areas(uid);

  for rec in
    select * from (values
      -- título, tipo, url, área, resumo, serve-para, estágio,
      -- força, intervalo, dias desde a revisão, dias desde a captura
      (
        'LangGraph: agentes como grafo de estados',
        'repo', 'https://github.com/langchain-ai/langgraph', 'agentic',
        'Framework da LangChain para modelar agentes como máquina de estados: nós são passos, arestas são decisões, e o estado atravessa o grafo inteiro.',
        'Serve quando seu agente precisa de ciclos, retomada e controle explícito do fluxo, coisa que uma cadeia linear de prompts não sustenta.',
        'rooted', 88, 21, 6, 96
      ),
      (
        'Model Context Protocol: a porta USB dos modelos',
        'link', 'https://modelcontextprotocol.io', 'agentic',
        'Protocolo aberto que padroniza como um modelo descobre e chama ferramentas, lê recursos e recebe prompts de servidores externos.',
        'Serve quando você cansou de escrever um adaptador por integração e quer que qualquer cliente fale com o seu servidor de ferramentas.',
        'rooted', 82, 18, 4, 88
      ),
      (
        'Reciprocal Rank Fusion em vez de média de scores',
        'note', null, 'ia',
        'Ao fundir busca léxica com busca vetorial, somar os scores é errado: ts_rank e distância de cosseno vivem em escalas incomparáveis. RRF usa só a posição em cada lista, 1/(60+rank), e dispensa calibração.',
        'Serve quando sua busca híbrida ora só devolve resultado de palavra-chave, ora só de vetor, e você não acha o peso certo entre as duas.',
        'grown', 64, 12, 9, 70
      ),
      (
        'pgvector: HNSW não aceita mais de 2000 dimensões',
        'note', null, 'ia',
        'O índice HNSW do pgvector tem teto de 2000 dimensões. Embeddings de 3072 simplesmente não indexam, e a busca vira scan sequencial da tabela inteira sem avisar ninguém.',
        'Serve quando a busca semântica fica lenta conforme a base cresce e o EXPLAIN mostra seq scan onde deveria haver índice.',
        'grown', 58, 10, 14, 64
      ),
      (
        'Instructor: saída estruturada com validação',
        'repo', 'https://github.com/567-labs/instructor', 'ia',
        'Envolve a chamada ao modelo com um schema Pydantic e faz o retry automático quando a saída não valida.',
        'Serve quando o modelo devolve JSON quase certo e você está escrevendo try/except em volta de JSON.parse pela quinta vez.',
        'sprout', 34, 5, 7, 40
      ),
      (
        'Ollama: modelos locais com uma linha',
        'repo', 'https://github.com/ollama/ollama', 'ia',
        'Roda modelos abertos localmente com uma API HTTP compatível o bastante para trocar de provedor sem reescrever o cliente.',
        'Serve quando a conta da API sobe no desenvolvimento ou o dado não pode sair da máquina.',
        'sprout', 30, 4, 5, 34
      ),
      (
        'Prompt de revisão de código que não elogia',
        'prompt', null, 'coding',
        'Aja como revisor sênior hostil ao consenso. Aponte só o que quebra em produção: race condition, erro engolido, query sem índice, limite não tratado. Para cada achado, dê o caso concreto de falha. Não comente estilo. Não elogie.',
        'Serve quando a revisão automática só devolve "ótimo trabalho, considere adicionar comentários" e você precisa de achado de verdade.',
        'grown', 71, 14, 5, 58
      ),
      (
        'Server Actions não substituem validação no servidor',
        'note', null, 'coding',
        'Uma Server Action é um endpoint HTTP público com assinatura gerada. Estar declarada dentro do componente não impede ninguém de chamá-la direto com o payload que quiser.',
        'Serve quando você ia confiar na validação do formulário e deixar a action escrever direto no banco.',
        'sprout', 26, 3, 4, 26
      ),
      (
        'Diferença real entre debounce e throttle',
        'snippet', null, 'coding',
        'Debounce só dispara depois que o ruído para; throttle dispara em cadência fixa durante o ruído. Busca enquanto digita quer debounce; scroll e resize querem throttle.',
        'Serve quando o campo de busca dispara uma requisição por tecla ou o handler de scroll trava a rolagem.',
        'grown', 55, 9, 6, 45
      ),
      (
        'Turbopack: quando o cache local mente',
        'note', null, 'devops',
        'Erro de build que não reproduz em máquina limpa quase sempre é cache. Apagar .next/cache resolve mais rápido do que investigar o stack trace.',
        'Serve quando o build quebra só na sua máquina, ou só na CI, e o diff não explica.',
        'sprout', 22, 3, 8, 30
      ),
      (
        'Cache do Docker: COPY do package.json antes do código',
        'note', null, 'devops',
        'Copiar o código-fonte antes de instalar dependências invalida a camada de install a cada commit. Copiar só os manifestos, instalar, e só então copiar o resto mantém a camada pesada em cache.',
        'Serve quando o build da imagem leva minutos para um commit que mudou uma linha de CSS.',
        'grown', 61, 11, 7, 52
      ),
      (
        'Vercel: maxDuration precisa ser declarado por rota',
        'note', null, 'devops',
        'Route handlers têm limite baixo por padrão. Chamada a modelo que demora mais que isso é cortada no meio, e o erro que chega ao cliente não diz que foi timeout.',
        'Serve quando a chamada de IA funciona local e devolve 504 mudo em produção.',
        'sprout', 28, 4, 3, 24
      ),
      (
        'Shape Up: appetite antes de estimativa',
        'link', 'https://basecamp.com/shapeup', 'produto',
        'Inverte a pergunta: em vez de "quanto tempo leva?", fixa-se quanto tempo vale a pena gastar e recorta-se o escopo para caber.',
        'Serve quando o roadmap é uma fila de estimativas furadas e tudo atrasa igual.',
        'rooted', 84, 24, 9, 110
      ),
      (
        'Feature vazia é pior que feature ausente',
        'idea', null, 'produto',
        'Uma tela que existe mas não tem o que mostrar ensina que o app não tem nada. Estado vazio precisa fazer alguma coisa acontecer, não descrever o que aconteceria.',
        'Serve quando o app parece morto no primeiro uso e a métrica de retorno no dia seguinte é zero.',
        'grown', 66, 13, 2, 38
      ),
      (
        'Currículo de dev sênior: resultado, não ferramenta',
        'note', null, 'carreira',
        'Listar stack diz o que você tocou. Dizer o que mudou, latência, custo, incidentes, receita, diz o que você resolve.',
        'Serve quando o currículo passa pelo filtro automático e trava na conversa com quem decide.',
        'sprout', 24, 4, 11, 44
      ),
      (
        'Trabalho profundo cabe em bloco, não em sobra',
        'idea', null, 'carreira',
        'Duas horas protegidas rendem mais que um dia inteiro fatiado por reunião. O custo não é o tempo da reunião, é a reentrada no contexto depois dela.',
        'Serve quando a semana termina cheia e nada de substancial saiu do lugar.',
        'grown', 52, 8, 10, 60
      ),
      -- ── Sementes: chegaram cruas e esperam destilação ─────────────────────
      (
        'https://github.com/browser-use/browser-use',
        'repo', 'https://github.com/browser-use/browser-use', null,
        null, null, 'seed', 5, 0, null, 2
      ),
      (
        'arxiv.org',
        'link', 'https://arxiv.org/abs/2210.03629', null,
        null, null, 'seed', 5, 0, null, 1
      ),
      (
        'testar tool calling paralelo vs sequencial e medir latência real',
        'idea', null, null,
        null, null, 'seed', 5, 0, null, 1
      ),
      (
        'rate limit: token bucket no edge ou no banco?',
        'idea', null, null,
        null, null, 'seed', 5, 0, null, 0
      )
    ) as t(
      title, kind, url, area_slug, summary, why_useful,
      stage, strength, interval_days, days_since_review, days_since_capture
    )
  loop
    -- Já plantado antes: pula sem tocar no que a pessoa possa ter editado.
    if exists (select 1 from items i where i.user_id = uid and i.title = rec.title) then
      continue;
    end if;

    insert into items (
      user_id, area_id, kind, title, content, url, summary, why_useful,
      stage, strength, interval_days, reviews,
      last_reviewed_at, next_review_at, created_at, updated_at
    )
    values (
      uid,
      (select a.id from areas a where a.user_id = uid and a.slug = rec.area_slug),
      rec.kind,
      rec.title,
      coalesce(rec.summary, ''),
      rec.url,
      rec.summary,
      rec.why_useful,
      rec.stage,
      rec.strength,
      rec.interval_days,
      case rec.stage when 'rooted' then 4 when 'grown' then 2 when 'sprout' then 1 else 0 end,
      case when rec.days_since_review is null
           then null
           else now() - make_interval(days => rec.days_since_review) end,
      case when rec.days_since_review is null
           then null
           else now() - make_interval(days => rec.days_since_review)
                     + make_interval(days => rec.interval_days) end,
      now() - make_interval(days => rec.days_since_capture),
      now() - make_interval(days => rec.days_since_capture)
    )
    returning id into new_id;

    ids := ids || new_id;
    planted := planted + 1;
  end loop;

  if planted = 0 then
    return 0;
  end if;

  -- Conexões: liga pares vizinhos do que acabou de ser plantado. Não é
  -- semântica de verdade, é para o mapa nascer com arestas em vez de uma
  -- nuvem de pontos soltos. As ligações reais vêm de suggest_links().
  for i in 1..greatest(array_length(ids, 1) - 2, 0) loop
    if i % 2 = 1 then
      insert into item_links (from_item_id, to_item_id, origin, score)
      values (ids[i], ids[i + 1], 'semantic', 0.7)
      on conflict do nothing;
    end if;
  end loop;

  -- Uma trilha em andamento, para a tela não nascer vazia.
  if not exists (select 1 from tracks t where t.user_id = uid) then
    insert into tracks (user_id, area_id, title, description)
    values (
      uid,
      (select a.id from areas a where a.user_id = uid and a.slug = 'agentic'),
      'Agente que faz, não que conversa',
      'Sair de um chat com ferramentas para um agente com estado, retomada e limite de gasto, construindo cada peça.'
    )
    returning id into track_id;

    insert into track_topics (track_id, title, notes, done, sort_order) values
      (track_id, 'Tool calling na unha',
       'Implemente o laço de ferramentas sem framework: schema, chamada, execução, devolução do resultado. Só assim se enxerga o que os frameworks escondem.', true, 0),
      (track_id, 'Estado que sobrevive ao processo',
       'Persista o estado do agente fora da memória. Mate o processo no meio de uma execução e retome de onde parou.', true, 1),
      (track_id, 'Grafo em vez de cadeia',
       'Reescreva o laço como máquina de estados. Compare o que fica mais fácil de depurar quando um passo falha.', false, 2),
      (track_id, 'Teto de gasto e de passos',
       'Todo agente precisa de fim. Imponha limite de iterações e de tokens, e decida o que acontece quando bate no teto.', false, 3),
      (track_id, 'Observabilidade do laço',
       'Registre cada passo com entrada, saída e duração. Sem isso, depurar agente é adivinhação.', false, 4),
      (track_id, 'Avaliação antes de refinar prompt',
       'Monte um conjunto pequeno de casos com resposta esperada. Mexer em prompt sem medir é andar no escuro.', false, 5);
  end if;

  return planted;
end;
$$;

revoke execute on function plant_starter_garden() from anon, public;
grant  execute on function plant_starter_garden() to authenticated;
