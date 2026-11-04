-- Mestre da Educação | Painel administrativo (fase de teste)
-- Não executar até autorizar a ativação do painel no ambiente principal.
-- Nunca colocar chave service_role, senhas ou lista de administradores no frontend.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists private.mestre_educacao_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.mestre_educacao_admins from public, anon, authenticated;

create table if not exists public.mestre_educacao_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Jogador',
  created_at timestamptz not null default now(),
  status text not null default 'active' check(status in ('active','suspended','banned')),
  suspended_until timestamptz,
  moderation_reason text,
  moderated_at timestamptz,
  constraint mestre_status_valid check (
    (status = 'suspended' and suspended_until is not null)
    or (status <> 'suspended' and suspended_until is null)
  )
);
alter table public.mestre_educacao_profiles enable row level security;
revoke all on public.mestre_educacao_profiles from public, anon, authenticated;
grant select on public.mestre_educacao_profiles to authenticated;
drop policy if exists mestre_profiles_select_own on public.mestre_educacao_profiles;
create policy mestre_profiles_select_own on public.mestre_educacao_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function private.mestre_profile_from_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.mestre_educacao_profiles(user_id,display_name,created_at)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),split_part(coalesce(new.email,''),'@',1),'Jogador'),60),
    coalesce(new.created_at,now())
  ) on conflict(user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.mestre_profile_from_user() from public, anon, authenticated;
drop trigger if exists mestre_profile_on_auth_signup on auth.users;
create trigger mestre_profile_on_auth_signup
  after insert on auth.users for each row execute function private.mestre_profile_from_user();

insert into public.mestre_educacao_profiles(user_id,display_name,created_at)
select id,
       left(coalesce(nullif(btrim(raw_user_meta_data->>'display_name'),''),split_part(coalesce(email,''),'@',1),'Jogador'),60),
       created_at
from auth.users on conflict(user_id) do nothing;

create or replace function private.mestre_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists(
    select 1 from private.mestre_educacao_admins a
    join auth.users u on u.id = a.user_id
    where a.user_id=(select auth.uid()) and u.email_confirmed_at is not null
 );
$$;
revoke all on function private.mestre_is_admin() from public, anon, authenticated;
grant execute on function private.mestre_is_admin() to authenticated;

create or replace function private.mestre_can_play(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select coalesce(
    (select p.status='active'
         or (p.status='suspended' and p.suspended_until <= now())
     from public.mestre_educacao_profiles p where p.user_id = p_user_id),
    true
 );
$$;
revoke all on function private.mestre_can_play(uuid) from public, anon, authenticated;
grant execute on function private.mestre_can_play(uuid) to authenticated;

create or replace function public.mestre_player_access()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'status', case when p.status='suspended' and p.suspended_until <= now() then 'active' else p.status end,
      'suspended_until',case when p.status='suspended' and p.suspended_until > now() then p.suspended_until else null end,
      'reason',case when p.status='active' or (p.status='suspended' and p.suspended_until<=now()) then null else p.moderation_reason end
    ) from public.mestre_educacao_profiles p where p.user_id=(select auth.uid())
  ), jsonb_build_object('status','active','suspended_until',null,'reason',null));
$$;
revoke all on function public.mestre_player_access() from public, anon, authenticated;
grant execute on function public.mestre_player_access() to authenticated;

-- Proteção de permissões: usuário comum não tem acesso a saves banidos e
-- não pode alterar a identidade da linha. Essa restrição inclui clientes antigos.
drop policy if exists mestre_select_own on public.mestre_educacao_saves;
drop policy if exists mestre_insert_own on public.mestre_educacao_saves;
drop policy if exists mestre_update_own on public.mestre_educacao_saves;
create policy mestre_select_own on public.mestre_educacao_saves for select to authenticated
 using ((select auth.uid())=user_id and private.mestre_can_play(user_id));
create policy mestre_insert_own on public.mestre_educacao_saves for insert to authenticated
 with check ((select auth.uid())=user_id and private.mestre_can_play(user_id));
create policy mestre_update_own on public.mestre_educacao_saves for update to authenticated
 using ((select auth.uid())=user_id and private.mestre_can_play(user_id))
 with check ((select auth.uid())=user_id and private.mestre_can_play(user_id));

alter table public.mestre_educacao_saves
  add column if not exists admin_revision bigint not null default 0 check(admin_revision>=0),
  add column if not exists ack_admin_revision bigint not null default 0 check(ack_admin_revision>=0);

create or replace function private.mestre_guard_save()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.admin_revision<>0 or new.ack_admin_revision<>0 then
      raise exception 'Revisões administrativas inválidas' using errcode='23514';
    end if;
  elsif not private.mestre_is_admin() then
    if new.admin_revision<>old.admin_revision or new.ack_admin_revision<>old.admin_revision then
      raise exception 'A partida foi alterada pelo administrador: sincronize a versão atualizada' using errcode='40001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.mestre_guard_save() from public, anon, authenticated;
drop trigger if exists mestre_guard_save_update on public.mestre_educacao_saves;
create trigger mestre_guard_save_update before insert or update on public.mestre_educacao_saves
  for each row execute function private.mestre_guard_save();

create table if not exists private.mestre_educacao_admin_audit (
 id bigint generated always as identity primary key,
 admin_id uuid not null references auth.users(id),
 target_id uuid not null references auth.users(id) on delete cascade,
 action text not null,
 reason text not null,
 old_values jsonb,
 new_values jsonb,
 created_at timestamptz not null default now()
);
create index if not exists mestre_admin_audit_target_idx
 on private.mestre_educacao_admin_audit(target_id,created_at desc);
revoke all on private.mestre_educacao_admin_audit from public, anon, authenticated;

-- Apenas administradores autenticados podem usar RPCs com privilégios elevados.
-- Checagem no servidor em TODAS as rotas.
create or replace function public.mestre_admin_dashboard(p_search text default '',p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_search text:=left(btrim(coalesce(p_search,'')),80);
begin
 if not private.mestre_is_admin() then
   raise exception 'Acesso administrativo negado' using errcode='42501';
 end if;
 return jsonb_build_object(
   'total',(select count(*) from auth.users),
   'active',(select count(*) from auth.users u
     left join public.mestre_educacao_profiles p on p.user_id=u.id
     where p.status is null or p.status='active' or (p.status='suspended' and p.suspended_until<=now())),
   'blocked',(select count(*) from public.mestre_educacao_profiles
     where status='banned' or (status='suspended' and suspended_until>now())),
   'players', (
     select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
     from (
       select u.id as user_id,
              coalesce(p.display_name,'Jogador') as display_name,
              u.email, u.created_at, u.last_sign_in_at,
              case when p.status='suspended' and p.suspended_until<=now() then 'active'
                   else coalesce(p.status,'active') end as status,
              case when p.status='suspended' and p.suspended_until>now() then p.suspended_until else null end as suspended_until,
              p.moderation_reason,
              s.revision, s.updated_at as save_updated_at,
              s.game_state->'money' as money,
              s.game_state->'bank' as bank,
              s.game_state->'respect' as respect,
              s.game_state->'energy' as energy,
              s.game_state->'heat' as heat,
              s.game_state->'xp' as xp,
              s.game_state->'attributes' as attributes,
              s.game_state->'arena'->'rating' as arena_rating
       from auth.users u
       left join public.mestre_educacao_profiles p on p.user_id=u.id
       left join public.mestre_educacao_saves s on s.user_id=u.id
       where v_search = ''
          or u.email ilike '%'||v_search||'%'
          or coalesce(p.display_name,'') ilike '%'||v_search||'%'
          or u.id::text ilike '%'||v_search||'%'
       order by u.created_at desc limit greatest(1,least(coalesce(p_limit,60),100))
     ) x
   )
 );
end;
$$;

create or replace function public.mestre_admin_edit_player(
 p_user_id uuid,p_patch jsonb,p_expected_revision bigint,p_reason text default 'Ajuste de atributos'
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 v_original jsonb; v_next jsonb; v_revision bigint; v_key text; v_subkey text;
 v_value jsonb; v_number numeric; v_max numeric;
 v_before jsonb:='{}'::jsonb; v_after jsonb:='{}'::jsonb;
begin
 if not private.mestre_is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 if p_user_id is null then raise exception 'Jogador inválido';end if;
 if p_reason is null or char_length(btrim(p_reason))<3 or char_length(p_reason)>240
   then raise exception 'Informe um motivo entre 3 e 240 caracteres';end if;
 if jsonb_typeof(p_patch) <> 'object' or p_patch='{}'::jsonb
   then raise exception 'Alterações inválidas';end if;
 select game_state, revision into v_original,v_revision
 from public.mestre_educacao_saves where user_id=p_user_id for update;
 if not found then raise exception 'O jogador ainda não tem partida salva';end if;
 if v_revision is distinct from p_expected_revision then
   raise exception 'O jogador salvou uma versão mais nova. Atualize a lista antes de editar'
   using errcode='40001';
 end if;
 v_next:=v_original;
 for v_key,v_value in select key,value from jsonb_each(p_patch)
 loop
   if v_key='attributes' then
     if jsonb_typeof(v_value)<>'object' then raise exception 'Atributos inválidos';end if;
     for v_subkey in select jsonb_object_keys(v_value) loop
       if v_subkey not in ('intelligence','strength','charisma','resistance')
         then raise exception 'Atributo não permitido: %',v_subkey;end if;
       if jsonb_typeof(v_value->v_subkey)<>'number' then raise exception 'Atributo não numérico';end if;
       v_number := (v_value->>v_subkey)::numeric;
       if v_number<0 or v_number>1000 then raise exception 'Atributo fora do intervalo 0-1000';end if;
       v_before:=jsonb_set(v_before,'{attributes}',
          coalesce(v_before->'attributes','{}'::jsonb) ||
          jsonb_build_object(v_subkey,coalesce(v_original#>array['attributes',v_subkey],'null'::jsonb)),true);
       v_next:=jsonb_set(v_next,array['attributes',v_subkey],to_jsonb(v_number),true);
       v_after:=jsonb_set(v_after,'{attributes}',
          coalesce(v_after->'attributes','{}'::jsonb) ||
          jsonb_build_object(v_subkey,to_jsonb(v_number)),true);
     end loop;
   else
     if v_key not in ('money','bank','respect','energy','heat','xp','arena_rating')
       then raise exception 'Campo não permitido: %',v_key;end if;
     if jsonb_typeof(v_value)<>'number' then raise exception 'Valor não numérico: %',v_key;end if;
     v_number := (v_value#>>'{}')::numeric;
     v_max := case when v_key in ('energy','heat') then 100
                   when v_key='arena_rating' then 100000 else 1000000000 end;
     if v_number<0 or v_number>v_max or (v_key='arena_rating' and v_number<500) then
       raise exception 'Valor fora do limite em %',v_key;end if;
     if v_key not in ('money','bank','respect') and v_number<>trunc(v_number) then
       raise exception 'Use números inteiros em %',v_key;end if;
     if v_key='arena_rating' then
       v_before:=jsonb_set(v_before,'{arena_rating}',
          coalesce(v_original#>'{arena,rating}','null'::jsonb),true);
       v_next:=jsonb_set(v_next,'{arena,rating}',to_jsonb(v_number),true);
     else
       v_before:=jsonb_set(v_before,array[v_key],coalesce(v_original->v_key,'null'::jsonb),true);
       v_next:=jsonb_set(v_next,array[v_key],to_jsonb(v_number),true);
     end if;
     v_after:=jsonb_set(v_after,array[v_key],to_jsonb(v_number),true);
   end if;
 end loop;
 update public.mestre_educacao_saves
 set game_state=v_next,revision=revision+1,admin_revision=admin_revision+1,updated_at=now()
 where user_id=p_user_id;
 insert into private.mestre_educacao_admin_audit(admin_id,target_id,action,reason,old_values,new_values)
 values((select auth.uid()),p_user_id,'edit',btrim(p_reason),v_before,v_after);
 return jsonb_build_object('ok',true,'revision',v_revision+1,'changes',v_after);
end;
$$;

create or replace function public.mestre_admin_moderate(
 p_user_id uuid,p_action text,p_duration_minutes integer default null,p_reason text default 'Moderação administrativa'
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_before jsonb; v_after jsonb; v_until timestamptz;
begin
 if not private.mestre_is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 if p_user_id=(select auth.uid()) then raise exception 'Não pode suspender a própria conta administradora';end if;
 if p_action not in ('suspend','ban','unban') then raise exception 'Ação inválida';end if;
 if p_reason is null or length(btrim(p_reason))<3 or length(p_reason)>240 then
   raise exception 'Informe um motivo entre 3 e 240 caracteres';end if;
 if p_action='suspend' then
   if p_duration_minutes is null or p_duration_minutes<1 or p_duration_minutes>43200 then
     raise exception 'A suspensão deve durar entre 1 minuto e 30 dias';end if;
   v_until:=now() + make_interval(mins=>p_duration_minutes);
 end if;
 select jsonb_build_object('status',status,'suspended_until',suspended_until,'reason',moderation_reason)
 into v_before from public.mestre_educacao_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Jogador não encontrado';end if;
 update public.mestre_educacao_profiles
 set status=case when p_action='unban' then 'active'
                 when p_action='ban' then 'banned' else 'suspended' end,
     suspended_until=v_until,
     moderation_reason=case when p_action='unban' then null else btrim(p_reason) end,
     moderated_at=now()
 where user_id=p_user_id;
 select jsonb_build_object('status',status,'suspended_until',suspended_until,'reason',moderation_reason)
 into v_after from public.mestre_educacao_profiles where user_id=p_user_id;
 insert into private.mestre_educacao_admin_audit(admin_id,target_id,action,reason,old_values,new_values)
 values((select auth.uid()),p_user_id,p_action,btrim(p_reason),v_before,v_after);
 return v_after;
end;
$$;

create or replace function public.mestre_admin_history(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_result jsonb;
begin
 if not private.mestre_is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb)
 into v_result from (
   select id,target_id,admin_id,action,reason,old_values,new_values,created_at
   from private.mestre_educacao_admin_audit
   where p_user_id is null or target_id=p_user_id
   order by created_at desc limit 30
 ) a;
 return v_result;
end;
$$;

revoke all on function public.mestre_admin_dashboard(text,int) from public, anon, authenticated;
revoke all on function public.mestre_admin_edit_player(uuid,jsonb,bigint,text) from public, anon, authenticated;
revoke all on function public.mestre_admin_moderate(uuid,text,integer,text) from public, anon, authenticated;
revoke all on function public.mestre_admin_history(uuid) from public, anon, authenticated;
grant execute on function public.mestre_admin_dashboard(text,int) to authenticated;
grant execute on function public.mestre_admin_edit_player(uuid,jsonb,bigint,text) to authenticated;
grant execute on function public.mestre_admin_moderate(uuid,text,integer,text) to authenticated;
grant execute on function public.mestre_admin_history(uuid) to authenticated;

-- PRIMEIRO ADMINISTRADOR: depois de confirmar o e-mail da conta correta,
-- executar separadamente no SQL Editor (NÃO adivinhar o usuário):
-- Depois de o titular CONFIRMAR o endereço e de conferir que a consulta
-- encontra exatamente uma conta, executar separadamente:
-- insert into private.mestre_educacao_admins(user_id)
-- select id from auth.users
-- where lower(email)=lower('EMAIL_CONFIRMADO_PELO_TITULAR')
--   and email_confirmed_at is not null
-- on conflict(user_id) do nothing;
-- NÃO conceder privilégios a um usuário com e-mail ainda não confirmado.
commit;
