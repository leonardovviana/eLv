-- Marca quando uma nota foi DESENVOLVIDA por IA (o modo que tem licença para
-- acrescentar conteúdo), e não apenas revisada na forma.
--
-- Sem isso, aceitar uma expansão apaga para sempre a fronteira entre o que
-- você pensou e o que o modelo escreveu. Num segundo cérebro essa fronteira
-- é a diferença entre repertório e enfeite: você precisa saber de quem é a
-- frase que vai repetir numa reunião daqui a seis meses.
alter table items add column if not exists ai_expanded_at timestamptz;

comment on column items.ai_expanded_at is
  'Quando a nota foi desenvolvida por IA com licença para acrescentar conteúdo. Nulo = texto integralmente do autor (revisão de forma não conta).';
