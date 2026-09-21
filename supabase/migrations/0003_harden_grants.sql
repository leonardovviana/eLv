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
