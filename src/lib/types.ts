/**
 * Vocabulário do domínio.
 *
 * A v1 tinha `status: inbox | active | archived` — três caixas opacas que não
 * diziam nada sobre o que o item significa para você. Aqui o item MADURA, e o
 * estágio é a coisa mais visível da interface: é ele que transforma uma lista
 * parada num jardim que cresce ou murcha.
 */

export type ItemKind = "note" | "link" | "snippet" | "repo" | "prompt" | "idea";

/** `status` da v1 continua no banco, derivado de `stage` por trigger. */
export type ItemStatus = "inbox" | "active" | "archived";

export type Stage = "seed" | "sprout" | "grown" | "rooted" | "dormant";

export const ITEM_KINDS: { value: ItemKind; label: string; icon: string }[] = [
  { value: "note", label: "Nota", icon: "file-text" },
  { value: "link", label: "Link", icon: "link" },
  { value: "snippet", label: "Snippet", icon: "code-2" },
  { value: "repo", label: "Repositório", icon: "github" },
  { value: "prompt", label: "Prompt", icon: "message-square-quote" },
  { value: "idea", label: "Ideia", icon: "lightbulb" },
];

/**
 * Os quatro estágios vivos + o dormente.
 *
 * `tone` aponta para o token de cor, não para um hex: o estágio é linguagem
 * do sistema, então segue a paleta e não uma cor avulsa.
 */
export const STAGES: Record<
  Stage,
  { label: string; short: string; tone: string; hint: string; order: number }
> = {
  seed: {
    label: "Semente",
    short: "SEM",
    tone: "var(--ember)",
    hint: "Capturado cru. Ainda não foi destilado.",
    order: 0,
  },
  sprout: {
    label: "Broto",
    short: "BRO",
    tone: "var(--plasma)",
    hint: "Destilado e categorizado. Entrou no ciclo de revisão.",
    order: 1,
  },
  grown: {
    label: "Crescido",
    short: "CRE",
    tone: "var(--acid)",
    hint: "Revisado o bastante para você confiar que lembra.",
    order: 2,
  },
  rooted: {
    label: "Enraizado",
    short: "ENR",
    tone: "var(--acid)",
    hint: "Virou repertório: força alta e histórico de revisões.",
    order: 3,
  },
  dormant: {
    label: "Dormente",
    short: "DOR",
    tone: "var(--muted-foreground)",
    hint: "Fora do ciclo. Continua na busca, não cobra atenção.",
    order: 4,
  },
};

export type Grade = "forgot" | "hard" | "good" | "easy";

export const GRADES: { value: Grade; label: string; key: string; hint: string }[] = [
  { value: "forgot", label: "Esqueci", key: "1", hint: "volta amanhã" },
  { value: "hard", label: "Difícil", key: "2", hint: "volta logo" },
  { value: "good", label: "Lembrei", key: "3", hint: "espaça" },
  { value: "easy", label: "Fácil", key: "4", hint: "espaça muito" },
];

export type Area = {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  sort_order: number;
};

export type SourceMeta = {
  stars?: number;
  language?: string;
  owner?: string;
  repo?: string;
  topics?: string[];
  site?: string;
  favicon?: string;
};

export type Item = {
  id: string;
  area_id: string | null;
  kind: ItemKind;
  title: string;
  content: string;
  url: string | null;
  source_meta: SourceMeta;
  summary: string | null;
  why_useful: string | null;
  status: ItemStatus;
  stage: Stage;
  strength: number;
  ease: number;
  interval_days: number;
  reviews: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  opens: number;
  last_opened_at: string | null;
  /** Quando a nota foi desenvolvida por IA. Nulo = texto todo seu. */
  ai_expanded_at: string | null;
  pinned: boolean;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

/** O que a home precisa saber, numa chamada só (`brain_pulse`). */
export type Pulse = {
  total: number;
  seeds: number;
  sprouts: number;
  grown: number;
  rooted: number;
  dormant: number;
  due: number;
  due_soon: number;
  vitality: number;
  unindexed: number;
  captured_today: number;
  reviewed_today: number;
  links: number;
  areas: number;
  tracks: number;
  streak: number;
};

export const EMPTY_PULSE: Pulse = {
  total: 0,
  seeds: 0,
  sprouts: 0,
  grown: 0,
  rooted: 0,
  dormant: 0,
  due: 0,
  due_soon: 0,
  vitality: 0,
  unindexed: 0,
  captured_today: 0,
  reviewed_today: 0,
  links: 0,
  areas: 0,
  tracks: 0,
  streak: 0,
};

export type DueItem = {
  id: string;
  area_id: string | null;
  kind: ItemKind;
  title: string;
  summary: string | null;
  why_useful: string | null;
  url: string | null;
  content: string | null;
  stage: Stage;
  strength: number;
  vitality: number;
  reviews: number;
  interval_days: number;
  days_overdue: number;
};

export type LinkSuggestion = {
  a_id: string;
  a_title: string;
  a_kind: ItemKind;
  b_id: string;
  b_title: string;
  b_kind: ItemKind;
  score: number;
};

export type MapNode = {
  id: string;
  title: string;
  kind: ItemKind;
  stage: Stage;
  area_id: string | null;
  vitality: number;
};

export type MapEdge = { a: string; b: string; origin: string; score: number };

export type BrainMap = { nodes: MapNode[]; edges: MapEdge[] };

export type ActivityDay = { day: string; captures: number; reviews: number };

export type SearchHit = Pick<
  Item,
  "id" | "area_id" | "kind" | "title" | "summary" | "why_useful" | "url" | "source_meta" | "status" | "updated_at"
> & { score: number };

export type Track = {
  id: string;
  area_id: string | null;
  title: string;
  description: string;
  status: "active" | "done" | "paused";
  created_at: string;
  updated_at: string;
};

export type TrackTopic = {
  id: string;
  track_id: string;
  title: string;
  notes: string;
  done: boolean;
  sort_order: number;
  item_id: string | null;
};

/**
 * O "próximo movimento": a única decisão que a home toma.
 *
 * A home da v1 mostrava quatro números e seis atalhos, e quem abria não sabia
 * o que fazer primeiro. Aqui o app escolhe UMA ação e as outras viram detalhe.
 * A ordem abaixo é a regra de negócio: revisar antes de destilar (o que já
 * está dentro vale mais que o que acabou de chegar), destilar antes de
 * conectar, conectar antes de capturar mais.
 */
export type Move = {
  id: "plant" | "review" | "distill" | "connect" | "index" | "capture" | "rest";
  label: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: "acid" | "plasma" | "ember" | "muted";
  count?: number;
};
