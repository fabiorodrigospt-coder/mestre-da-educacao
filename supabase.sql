-- Mestre da Educação | Supabase | Isolado de outras aplicações.
-- Execute uma única vez no SQL Editor de um projeto Supabase com Authentication > Email habilitado.
create table if not exists public.mestre_educacao_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  game_state jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  constraint mestre_educacao_state_size check (pg_column_size(game_state) <= 2000000)
);
alter table public.mestre_educacao_saves enable row level security;
revoke all on public.mestre_educacao_saves from anon;
grant select, insert, update on public.mestre_educacao_saves to authenticated;

-- Cada jogador só acessa suas próprias linhas.
create policy "mestre_select_own" on public.mestre_educacao_saves
 for select to authenticated using ((select auth.uid()) = user_id);
create policy "mestre_insert_own" on public.mestre_educacao_saves
 for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "mestre_update_own" on public.mestre_educacao_saves
 for update to authenticated using ((select auth.uid()) = user_id)
 with check ((select auth.uid()) = user_id);
