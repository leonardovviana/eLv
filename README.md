# eLv, segundo cérebro

PWA pessoal de memória secundária. Você joga qualquer coisa dentro (um repo do GitHub, um prompt, um snippet, um artigo, uma ideia solta) e o app devolve isso para você antes de você esquecer.

A diferença para um arquivo morto está no verbo do meio: não basta guardar e buscar. O que você guardou **volta**.

**Em produção:** [elv-one.vercel.app](https://elv-one.vercel.app)

---

## O ciclo

Todo o produto gira em quatro movimentos. A navegação é essa ordem, não uma lista de módulos.

```
CAPTAR  →  DESTILAR  →  REVISAR  →  CONECTAR
   ↑                                    │
   └────────────────────────────────────┘
```

| Movimento | Tela | O que acontece |
|---|---|---|
| **Captar** | Fluxo (ou ⌘K de qualquer lugar) | Cola link, texto, código, ideia. Entra como **semente**: sem categoria, sem resumo, sem atrito. |
| **Destilar** | Fluxo | O Gemini categoriza, resume e escreve "serve para" de todas as sementes **numa chamada só**. Você confirma, ajusta ou arrasta para decidir. A semente vira **broto** e ganha data de revisão. |
| **Revisar** | Revisar | Fila diária por repetição espaçada. O resumo fica escondido até você tentar lembrar. Cada nota reagenda o item e mexe na força dele. |
| **Conectar** | Mapa | Constelação do acervo. A proximidade entre embeddings sugere ligações; aceitar vira aresta. |

### O jardim

A tela Hoje mostra o acervo como um canteiro cultivado em três dimensões, sobre piso polido:

- cada item é uma **haste com uma copa facetada** no topo, iluminada de verdade: cada face pega a luz num ângulo diferente, então a copa tem volume em vez de ser um disco colorido;
- o **estágio** define altura, tamanho da copa e marcas no talo. Semente é um grão pousado; enraizado é a haste mais alta, com duas marcas e um satélite em órbita;
- a **vitalidade** define altura e brilho, então o que você não revisita baixa e apaga à vista;
- cada **área é um canteiro**: anel gravado no chão, poça de luz por baixo e o nome na borda. A cor da área passa por um filtro que mantém o matiz e iguala saturação e luminosidade, para o campo não virar confete;
- itens **conectados** são ligados por arcos entre as copas (as 24 ligações mais fortes), então a rede do mapa também existe aqui;
- o piso **reflete** o campo, e poeira em suspensão e uma névoa ao fundo dão profundidade ao ar.

Arraste para girar, passe o ponteiro para ler, clique para abrir o item. São nove chamadas de desenho para o campo inteiro, com qualquer tamanho de acervo (tudo em `InstancedMesh`), e a cena para quando a aba está escondida ou o canvas sai da tela. O Three.js entra por importação dinâmica e só desce nessa tela; sem WebGL, o jardim some e a lista de áreas responde por tudo.

### Melhorar o que você escreveu

No item há dois botões, e a diferença entre eles é o ponto:

| Ação | Licença | Modelo |
|---|---|---|
| **Revisar texto** | Só a forma: ortografia, pontuação, frase embolada, markdown. O conteúdo é intocável. | Flash-Lite |
| **Desenvolver** | Pode acrescentar: o contexto que falta, o passo que você pulou, a ressalva óbvia, o exemplo que fecha o raciocínio. | Flash |

Desenvolver é mais útil e mais perigoso, porque daqui a seis meses você relê a nota sem lembrar o que era seu. Por isso o modo que acrescenta carrega três obrigações:

1. **Declara o que acrescentou.** A resposta traz uma lista `additions`, e a tela mostra ela em destaque, antes do texto, sob o título "Isto não estava na sua nota".
2. **Não contradiz você.** Discordância vira ressalva registrada, nunca troca de conclusão. E nada de número, benchmark, data ou comportamento de biblioteca inventado: na dúvida, o modelo escreve a dúvida.
3. **Deixa rastro.** Aceitar uma versão desenvolvida grava `ai_expanded_at` no item, e a tela passa a dizer "Desenvolvida com IA, partes deste texto não são suas". Revisão de forma não marca nada.

Desenvolver também recebe **o que você já salvou sobre o assunto** (via `related_items`, sem gastar requisição extra), então o texto cresce para dentro do seu acervo em vez de crescer para o conhecimento genérico do modelo. Os itens usados aparecem como links na proposta.

Em nenhum dos dois modos o texto entra no campo sozinho: a proposta fica ao lado da sua versão, e nada é gravado até você salvar.

E, atravessando tudo: **Buscar**, full-text do Postgres fundido com busca vetorial, mais o modo "perguntar ao meu cérebro" (RAG que responde citando suas próprias notas e admite quando a base não cobre).

### Estágios de maturação

Um item não tem status opaco, tem idade:

| Estágio | Significa |
|---|---|
| **Semente** | Capturado cru. Ainda não foi destilado. |
| **Broto** | Destilado e categorizado. Entrou no ciclo de revisão. |
| **Crescido** | Revisado o bastante para você confiar que lembra. |
| **Enraizado** | Virou repertório: força alta e histórico de revisões. |
| **Dormente** | Fora do ciclo. Continua na busca, não cobra atenção. |

### Força e vitalidade

Cada item tem uma **força** de 0 a 100 que **decai com o tempo**, em curva exponencial sobre o tempo *vencido* (não sobre o tempo absoluto). É isso que enche a fila sozinha e o que faz a home ter algo a dizer todo dia.

A força guardada e a vitalidade de hoje aparecem juntas na barrinha de cada cartão: o fantasma é o que você já soube, a parte acesa é o que sobrou.

O decaimento nunca é gravado decaído. Fosse gravado, precisaria de um cron varrendo a tabela inteira toda madrugada; calculado em `item_vitality()`, sai de graça na própria consulta.

Tipos de item: `note`, `link`, `snippet`, `repo`, `prompt`, `idea`. Uma lista de repositórios é só conteúdo, não existe módulo "GitHub".

---

## Telas

| Rota | O que é |
|---|---|
| `/` | **Hoje.** Pulso do cérebro e **um** próximo movimento. Nunca mostra quatro opções concorrendo. |
| `/fluxo` | Captura e destilação, as duas pontas do mesmo gesto. |
| `/revisar` | Sessão de revisão, com teclado (espaço revela, 1-4 dão nota, S adia). |
| `/buscar` | Busca híbrida e perguntas ao acervo. |
| `/mapa` | Constelação e ligações sugeridas. |
| `/trilhas` | Roteiros de estudo montados sobre o que você já salvou. |
| `/config` | Índice semântico, consumo de IA, backup, conta. |
| `/preview` | Bancada de QA visual com dados de fixture. Pública, não lê o banco, fora da navegação. |

**⌘K** abre a barra de comando em qualquer tela: captura, busca, pergunta e navegação. No celular, o botão central do dock faz o mesmo.

**Modo repouso:** parado por cinquenta segundos, o app começa a lembrar em voz alta, trazendo fragmentos reais do acervo sobre uma constelação em deriva. Qualquer movimento dissolve. Respeita `prefers-reduced-motion`.

---

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 3 · Radix/shadcn · Supabase (Postgres + Auth + pgvector) · Gemini via REST · Three.js no jardim · deploy Vercel.

Sem biblioteca de animação: o movimento é CSS, scroll-driven animations, Web Animations e canvas. Nada que se mexe passa por estado do React a 60fps. O Three.js é a única dependência pesada e fica num chunk próprio, carregado sob demanda.

---

## Setup

### 1. Banco

No [SQL Editor do Supabase](https://supabase.com/dashboard), rode em ordem:

1. `supabase/migrations/0001_init.sql` — tabelas, RLS, índices, busca híbrida
2. `supabase/migrations/0003_harden_grants.sql` — endurecimento apontado pelos advisors
3. `supabase/migrations/0004_cycle.sql` — estágios, força, revisão espaçada, pulso, mapa
4. `supabase/migrations/0005_starter_garden.sql` — acervo de partida
5. `supabase/migrations/0006_ai_expanded.sql` — marca de nota desenvolvida por IA

> A migration `0002` (dez repositórios de exemplo) foi substituída pela `0005`, que planta um acervo já distribuído pelos estágios do ciclo. Em projeto novo, pule a `0002`.

A `0001` cria um trigger em `auth.users`: ao criar sua conta, as seis áreas padrão nascem junto. Se a conta já existia, o app chama `ensure_default_areas()` no primeiro login.

### 2. Variáveis

```bash
cp .env.example .env.local
```

| Variável | Onde pegar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | idem |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

A chave do Gemini **nunca** chega ao browser: só é lida nos route handlers em `/api/ai/*`.

### 3. Auth

**Usuário e senha, sem e-mail.** O Supabase só autentica por e-mail ou telefone, então o nome de usuário vira um endereço interno determinístico — `leo` → `leo@elv.local` (ver [`src/lib/username.ts`](src/lib/username.ts)). O `.local` é reservado por RFC: não existe caixa postal do outro lado e nenhuma mensagem sai do projeto. O endereço é só a chave que o GoTrue exige, e quem entra nunca vê isso.

O formulário posta numa Server Action ([`src/app/login/actions.ts`](src/app/login/actions.ts)) e o cookie de sessão sai na própria resposta. Não há rota de callback, link para clicar nem origem para configurar.

Um ajuste é obrigatório em Supabase → Authentication → Sign In / Providers → Email:

- **Confirm email: desligado.** Ligado, o cadastro fica esperando a confirmação de um endereço que não recebe e-mail, e a conta nunca entra. Com a chave ligada, a tela avisa em vez de deixar a pessoa no escuro.

Depois de criar sua conta, dá para desligar **Allow new users to sign up** no mesmo painel: a aba "Criar conta" passa a recusar novos cadastros e o app vira de um dono só.

Não existe recuperação de senha: sem e-mail, não há para onde mandar o link. A troca fica em **Config → Conta → Nova senha**, com a sessão aberta. Perdendo a senha, o caminho é o SQL Editor do Supabase:

```sql
update auth.users
set encrypted_password = extensions.crypt('nova-senha', extensions.gen_salt('bf'))
where email = 'leo@elv.local';
```

**Conta antiga, criada por magic link?** O mesmo SQL Editor converte ela em usuário e senha sem perder nada do acervo — o `user_id` continua o mesmo, então itens, áreas e trilhas vêm junto:

```sql
update auth.users
set email              = 'leo@elv.local',
    encrypted_password = extensions.crypt('sua-senha', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                         || jsonb_build_object('username', 'leo')
where email = 'voce@gmail.com';
```

Enquanto não converter, ela continua entrando: o campo **Usuário** aceita o e-mail inteiro quando o que você digita tem `@` — o que falta nessa conta é só a senha, que o primeiro `update` acima define.

### 4. Rodar

```bash
npm install
npm run generate:icons   # gera os PNGs do PWA (ficam fora do git)
npm run dev
```

### 5. Primeiro uso

1. Crie a conta com usuário e senha (aba **Criar conta**)
2. Na home, **Plantar acervo de exemplo**. Isso enche o app com sementes cruas, brotos e raízes com histórico, e a fila de revisão já nasce com itens vencidos
3. **Config → Indexar pendentes**, para tudo entrar na busca semântica
4. **Revisar.** É o movimento que a v1 não tinha e o que faz o resto valer a pena

---

## A quota do Gemini molda o design

O free tier é mais apertado do que parece (o Flash topo de linha roda na casa de **20 requisições por dia**) e o Google não publica a tabela completa. O app é construído em volta disso:

- **Modelos configuráveis por env**, não hardcoded. `GEMINI_MODEL` para volume, `GEMINI_MODEL_HEAVY` para RAG e trilhas.
- **Lote sempre.** Destilar manda os N itens numa chamada, nunca uma por item.
- **`content_hash`.** Um item só é reindexado quando o texto muda de verdade.
- **Indexação sob demanda**, em Config. Salvar uma nota nunca fica lento nem falha por quota.
- **Cache de embeddings de consulta** no processo: repetir uma busca não gasta requisição.
- **Melhorar nota é uma chamada por vez, sob demanda**, e nunca em lote: reescrever o texto de vinte itens de uma vez produziria vinte reescritas que ninguém confere. Revisar usa o modelo barato; só desenvolver usa o pesado.
- **Ligações sugeridas não gastam IA.** `suggest_links()` compara embeddings que já existem, dentro do Postgres.
- **Degradação graciosa.** Sem chave, sem quota ou com a API fora, o app inteiro continua funcionando: só a parte semântica se cala. Captura, destilação manual, revisão, mapa e busca full-text seguem de pé.
- **`ai_runs`** registra cada chamada e o modelo que de fato respondeu, e alimenta o contador do dia em Config.

### Quando o Google está de joelhos

O erro mais comum não é seu: é `503 UNAVAILABLE`, pico de demanda do lado deles. A camada trata isso como coisa diferente de quota:

| Situação | O que o app faz |
|---|---|
| **503 / 500 / 504** | Até 3 novas tentativas, com recuo exponencial e jitter (o jitter evita que todo mundo que tomou 503 volte no mesmo instante). Respeita `Retry-After` quando vem. |
| **503 que não passa** | Vira `GeminiUnavailableError`, com mensagem legível. A tela mostra um toast com **Tentar de novo**, não o JSON do Google. |
| **Modelo pesado sobrecarregado** | Cai para o modelo leve e **declara** a troca: a tela avisa que a resposta saiu do modelo leve. Trocar em silêncio economizaria um erro e gastaria confiança. |
| **429 por dia** | Não insiste e não cai para outro modelo: a quota é da conta, não do modelo. |

Isso é testável sem esperar o próximo pico:

```bash
npm run test:gemini
```

Sobe um servidor que finge ser a API e devolve 503 sob demanda (`GEMINI_API_BASE` aponta a camada para ele), e verifica as cinco situações acima. Roda com o strip-types do Node: sem runner, sem build.

---

## Três decisões que não são óbvias

### A revisão espaçada roda no banco

`register_review()` recalcula intervalo, força, estágio e grava o log numa transação. Feito no cliente, seriam quatro idas ao banco, e uma falha no meio deixaria o item com intervalo novo e força velha. O SM-2 aqui é enxuto e move **duas** coisas: quando o item volta e quanto ele pesa no pulso. Só o intervalo deixaria o painel estático; só a força deixaria a fila burra.

### Embeddings em 768 dimensões

O **índice HNSW do pgvector não aceita mais de 2000 dimensões**. O `gemini-embedding-001` devolve 3072 por padrão, e com esse tamanho não haveria índice nenhum: a busca viraria scan sequencial da tabela inteira.

Os vetores também são normalizados L2 em [`src/lib/gemini.ts`](src/lib/gemini.ts), porque o `-001` não renormaliza sozinho quando truncado. Mas atenção ao que isso é e ao que não é: a busca atual **não depende** da normalização para estar correta, já que `<=>` é distância de cosseno e divide pelas normas por definição. A normalização serve para deixar a porta aberta para inner product (`<#>`, mais rápido, e aí sim exige norma 1) e para manter os centroides de `related_items` e `suggest_links` bem comportados.

### Reciprocal Rank Fusion, não média de scores

`ts_rank_cd` e distância de cosseno vivem em escalas incomparáveis. Somar os dois direto faz uma das buscas dominar a outra de forma arbitrária, e o peso "certo" muda conforme a consulta. RRF usa só a **posição** em cada lista (`1/(60+rank)`), então funde sem calibrar nada.

Está em `search_items`, em [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). A função aceita `q_embedding = NULL` e cai para full-text puro: é isso que mantém a busca viva quando o Gemini não responde.

---

## Estrutura

```
src/
  app/
    (app)/              telas autenticadas: /, /fluxo, /revisar, /buscar, /mapa, /areas, /item, /trilhas, /config
    api/ai/             distill, polish, extract-url, embed, ask, track
    api/search/         busca híbrida
    api/export/         backup JSON
    login/              usuário e senha (Server Action, sem callback)
    preview/            bancada de QA visual (fixtures, pública)
  components/
    motion.tsx          primitivas de movimento (nada re-renderiza por quadro)
    idle-dream.tsx      modo repouso
    constellation.tsx   grafo em canvas, layout por força
    garden-scene.tsx    jardim 3D (Three.js, instanced meshes)
    review-session.tsx  sessão de revisão
    distiller.tsx       triagem com gesto e teclado
  lib/
    brain.ts            leitura do estado do cérebro e escolha do próximo movimento
    gemini.ts           camada Gemini: modelos, retry, quota tipada, normalizeL2
    embed-items.ts      indexação incremental por content_hash
    actions/            server actions (items, cycle)
supabase/migrations/    schema, RLS, ciclo, busca, jardim inicial
```

---

## Backup

**Config → Exportar JSON** baixa tudo: áreas, itens, tags e trilhas. Embeddings ficam de fora de propósito: são derivados e voltam com um clique em "Indexar pendentes".
