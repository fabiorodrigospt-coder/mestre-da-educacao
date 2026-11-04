begin;
create table private.mestre_player_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid not null, occurred_at timestamptz not null,
 received_at timestamptz not null default now(),
 action text not null,target text not null default '',label text not null default '',
 details jsonb not null default '{}',unique(user_id,event_id)
);
create index mestre_player_events_user_idx on private.mestre_player_events(user_id,id desc);
create index mestre_player_events_received_idx on private.mestre_player_events(user_id,received_at);
alter table private.mestre_player_events enable row level security;
revoke all on private.mestre_player_events from public,anon,authenticated;

create function private.mestre_activity_submit(p_events jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid());e jsonb;n int:=0;total int;
begin
 if u is null or not private.mestre_can_play(u) then raise exception 'Acesso negado' using errcode='42501';end if;
 if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>40 then raise exception 'Lote inválido';end if;
 if pg_column_size(p_events)>400000 then raise exception 'Lote muito grande';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,7));
 select count(*) into total from private.mestre_player_events where user_id=u and received_at>=date_trunc('day',now());
 if total+jsonb_array_length(p_events)>5000 then raise exception 'Limite diário do histórico atingido. Eventos continuam na fila local';end if;
 for e in select value from jsonb_array_elements(p_events) loop
   if jsonb_typeof(e)<>'object' or not(e?'id') or not(e?'at') or not(e?'action') or e->>'action' is null
     or (e->>'action')!~'^[a-z0-9_-]{1,48}$' or coalesce(jsonb_typeof(e->'details'),'object')<>'object'
     or pg_column_size(e)>16000 then raise exception 'Evento inválido';end if;
   insert into private.mestre_player_events(user_id,event_id,occurred_at,action,target,label,details)
   values(u,(e->>'id')::uuid,least((e->>'at')::timestamptz,now()),e->>'action',left(coalesce(e->>'target',''),80),left(coalesce(e->>'label',''),180),coalesce(e->'details','{}'))
   on conflict(user_id,event_id) do nothing;
   n:=n+1;
 end loop;
 return jsonb_build_object('accepted',n);
end $$;

create function private.mestre_admin_activity(p_user_id uuid,p_before bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;pv jsonb;
begin
 if not private.mestre_is_admin() then raise exception 'Acesso administrativo negado' using errcode='42501';end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Jogador não encontrado';end if;
 select jsonb_build_object('events',coalesce(jsonb_agg(to_jsonb(x) order by x.id desc),'[]'),'next',case when count(*)=100 then min(x.id) else null end)
 into result from (select id,occurred_at,received_at,action,target,label,details from private.mestre_player_events
 where user_id=p_user_id and (p_before is null or id<p_before) order by id desc limit 100)x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into pv from (
 select m.id,m.kind,m.mode,m.state,m.round,m.created_at,m.finished_at,m.winner,m.ranked,m.reason,
 case when m.p1=p_user_id then m.score1 else m.score2 end as own_score,
 case when m.p1=p_user_id then m.score2 else m.score1 end as opponent_score,
 (select display_name from public.mestre_educacao_profiles where user_id=case when m.p1=p_user_id then m.p2 else m.p1 end) as opponent,
 case when m.state='finished' then (select coalesce(jsonb_agg(jsonb_build_object('round',r.round,'choice',case when m.p1=p_user_id then r.move1 else r.move2 end,
 'points',case when m.p1=p_user_id then r.points1 else r.points2 end) order by r.round),'[]') from private.mestre_pvp_rounds r where r.match_id=m.id) else null end as rounds
 from private.mestre_pvp_matches m where m.p1=p_user_id or m.p2=p_user_id order by m.created_at desc limit 20)x;
 return result||jsonb_build_object('pvp',pv,'notice','Ações individuais são relatos do aparelho, enviados ao reconectar. Não comprovam ausência de adulteração. O PvP vem do servidor; escolhas só aparecem após o fim do duelo.');
end $$;
create function public.mestre_activity_submit(p_events jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.mestre_activity_submit(p_events) $$;
create function public.mestre_admin_activity(p_user_id uuid,p_before bigint default null) returns jsonb language sql security invoker set search_path='' as $$ select private.mestre_admin_activity(p_user_id,p_before) $$;
revoke all on function private.mestre_activity_submit(jsonb),private.mestre_admin_activity(uuid,bigint),public.mestre_activity_submit(jsonb),public.mestre_admin_activity(uuid,bigint) from public,anon,authenticated;
grant execute on function private.mestre_activity_submit(jsonb),private.mestre_admin_activity(uuid,bigint),public.mestre_activity_submit(jsonb),public.mestre_admin_activity(uuid,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
