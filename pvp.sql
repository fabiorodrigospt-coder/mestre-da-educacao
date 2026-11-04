-- PvP: all competitive state and answers remain private. No save changes.
begin;
create table private.mestre_pvp_builds (
 user_id uuid primary key references auth.users(id) on delete cascade,
 attrs jsonb not null default '{"didatica":10,"dominio":10,"carisma":10,"paciencia":10,"argumentacao":10,"percepcao":10,"criatividade":10}'
);
create table private.mestre_pvp_questions (
 id bigint generated always as identity primary key, subject text not null,
 difficulty int not null check(difficulty between 1 and 3), prompt text not null,
 options jsonb not null check(jsonb_array_length(options)=4), answer int not null check(answer between 0 and 3), explanation text not null
);
create table private.mestre_pvp_matches (
 id uuid primary key default gen_random_uuid(), code text unique not null,
 kind text not null check(kind in ('debate','quiz')), mode text not null check(mode in ('async','live')),
 subject text not null, difficulty int not null, p1 uuid not null references auth.users(id), p2 uuid references auth.users(id),
 state text not null default 'waiting' check(state in ('waiting','ready','active','finished','cancelled')),
 ready1 boolean not null default false, ready2 boolean not null default false,
 build1 jsonb, build2 jsonb, focus1 int not null default 100, focus2 int not null default 100,
 round int not null default 1, score1 numeric not null default 0, score2 numeric not null default 0,
 questions bigint[] not null default '{}', deadline timestamptz, created_at timestamptz not null default now(),
 finished_at timestamptz, winner uuid, ranked boolean not null default false,
 reason text, check(p2 is null or p1<>p2)
);
create index mestre_pvp_match_p1 on private.mestre_pvp_matches(p1,created_at desc);
create index mestre_pvp_match_p2 on private.mestre_pvp_matches(p2,created_at desc);
create table private.mestre_pvp_moves (
 match_id uuid not null references private.mestre_pvp_matches(id) on delete cascade,
 round int not null check(round between 1 and 5), user_id uuid not null references auth.users(id),
 choice text not null, submitted_at timestamptz not null default now(),
 primary key(match_id,round,user_id)
);
create table private.mestre_pvp_rounds (
 match_id uuid not null references private.mestre_pvp_matches(id) on delete cascade,
 round int not null, move1 text, move2 text, points1 numeric not null, points2 numeric not null,
 primary key(match_id,round)
);
alter table private.mestre_pvp_builds enable row level security;
alter table private.mestre_pvp_questions enable row level security;
alter table private.mestre_pvp_matches enable row level security;
alter table private.mestre_pvp_moves enable row level security;
alter table private.mestre_pvp_rounds enable row level security;
revoke all on private.mestre_pvp_builds,private.mestre_pvp_questions,private.mestre_pvp_matches,private.mestre_pvp_moves,private.mestre_pvp_rounds from public,anon,authenticated;

create function private.mestre_pvp_require() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid());
begin
 if u is null then raise exception 'Entre na sua conta para jogar PvP' using errcode='42501';end if;
 if not private.mestre_can_play(u) then raise exception 'Conta bloqueada para PvP' using errcode='42501';end if;
 return u;
end $$;

create function private.mestre_pvp_finish(p_id uuid,p_reason text default 'Cinco rodadas concluídas',p_winner uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare m private.mestre_pvp_matches; n int; played1 int; played2 int;
begin
 select * into m from private.mestre_pvp_matches where id=p_id for update;
 if m.state<>'active' then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(least(m.p1::text,m.p2::text)||greatest(m.p1::text,m.p2::text),0));
 select count(*) into n from private.mestre_pvp_matches x
 where x.state='finished' and x.ranked and x.kind=m.kind and x.mode=m.mode
 and x.finished_at>=date_trunc('day',now()) and ((x.p1=m.p1 and x.p2=m.p2) or (x.p1=m.p2 and x.p2=m.p1));
 select count(*) filter(where user_id=m.p1),count(*) filter(where user_id=m.p2)
 into played1,played2 from private.mestre_pvp_moves where match_id=m.id;
 update private.mestre_pvp_matches set state='finished',finished_at=now(),reason=p_reason,
 winner=coalesce(p_winner,case when score1>score2 then p1 when score2>score1 then p2 else null end),
 ranked=(n<3 and played1>0 and played2>0),deadline=null where id=m.id;
end $$;

create function private.mestre_pvp_power(a jsonb,c text,op text) returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if c is null then return 0;end if;
 n:=case c
 when 'argumentar' then (a->>'argumentacao')::int*.45+(a->>'dominio')::int*.35+(a->>'didatica')::int*.2
 when 'contra' then (a->>'percepcao')::int*.45+(a->>'paciencia')::int*.3+(a->>'argumentacao')::int*.25
 when 'improvisar' then (a->>'criatividade')::int*.5+(a->>'carisma')::int*.35+(a->>'dominio')::int*.15
 when 'preparar' then (a->>'percepcao')::int*.4+(a->>'paciencia')::int*.4+(a->>'didatica')::int*.2 end;
 n:=n+case when c='argumentar' and op='preparar' then 8
 when c='contra' and op='argumentar' then 9
 when c='preparar' and op='contra' then 6
 when c='improvisar' and op='contra' then 7
 when c='contra' and op='preparar' then -5
 when c='preparar' and op='argumentar' then -5 else 0 end;
 return greatest(1,n);
end $$;

create function private.mestre_pvp_resolve(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare m private.mestre_pvp_matches; c1 text;c2 text;v1 numeric;v2 numeric;q private.mestre_pvp_questions;bonus1 int;bonus2 int;
begin
 select * into m from private.mestre_pvp_matches where id=p_id for update;
 if m.state in ('waiting','ready') and m.deadline<now() then
 update private.mestre_pvp_matches set state='cancelled',reason='Convite expirado' where id=m.id;return;end if;
 if m.state<>'active' then return;end if;
 if not private.mestre_can_play(m.p1) or not private.mestre_can_play(m.p2) then
 update private.mestre_pvp_matches set state='cancelled',reason='Partida cancelada por bloqueio de conta' where id=m.id;return;end if;
 select choice into c1 from private.mestre_pvp_moves where match_id=m.id and round=m.round and user_id=m.p1;
 select choice into c2 from private.mestre_pvp_moves where match_id=m.id and round=m.round and user_id=m.p2;
 if (c1 is null or c2 is null) and now()<m.deadline then return;end if;
 if m.mode='async' and (c1 is null or c2 is null) then
   if c1 is null and c2 is null then update private.mestre_pvp_matches set state='cancelled',reason='Prazo de resposta esgotado' where id=m.id;
   else perform private.mestre_pvp_finish(m.id,'Vitória por prazo de resposta',case when c1 is not null then m.p1 else m.p2 end);end if;return;
 end if;
 if m.kind='quiz' then
 select * into q from private.mestre_pvp_questions where id=m.questions[m.round];
 v1:=case when c1=q.answer::text then 100 else 0 end;
 v2:=case when c2=q.answer::text then 100 else 0 end;
 else
 select case when move1='preparar' then 5 else 0 end,case when move2='preparar' then 5 else 0 end into bonus1,bonus2
 from private.mestre_pvp_rounds where match_id=m.id and round=m.round-1;
 v1:=private.mestre_pvp_power(m.build1,c1,c2)+case when c1 is not null then coalesce(bonus1,0) else 0 end;
 v2:=private.mestre_pvp_power(m.build2,c2,c1)+case when c2 is not null then coalesce(bonus2,0) else 0 end;
 -- Improvisation varies on the server; clients cannot choose the roll.
 if c1='improvisar' then v1:=greatest(1,v1+floor(random()*11)-5);end if;
 if c2='improvisar' then v2:=greatest(1,v2+floor(random()*11)-5);end if;
 end if;
 insert into private.mestre_pvp_rounds values(m.id,m.round,c1,c2,v1,v2);
 update private.mestre_pvp_matches set score1=score1+v1,score2=score2+v2 where id=m.id;
 if m.round=5 then perform private.mestre_pvp_finish(m.id);
 else update private.mestre_pvp_matches set round=round+1,deadline=now()+case when mode='live' then interval '45 seconds' else interval '48 hours' end where id=m.id;end if;
end $$;

create function private.mestre_pvp_view(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m private.mestre_pvp_matches;u uuid:=private.mestre_pvp_require();q jsonb;history jsonb;ownchoice text;
begin
 select * into m from private.mestre_pvp_matches where id=p_id;
 if not found or u not in (m.p1,coalesce(m.p2,m.p1)) then raise exception 'Partida indisponível' using errcode='42501';end if;
 select choice into ownchoice from private.mestre_pvp_moves where match_id=m.id and round=m.round and user_id=u;
 if m.kind='quiz' and m.state='active' then
 select jsonb_build_object('prompt',prompt,'options',options) into q from private.mestre_pvp_questions where id=m.questions[m.round];end if;
 select coalesce(jsonb_agg(jsonb_build_object('round',r.round,'move1',case when m.kind='debate' or m.state='finished' then r.move1 else null end,'move2',case when m.kind='debate' or m.state='finished' then r.move2 else null end,
 'points1',case when m.kind='debate' or m.state='finished' then r.points1 else null end,
 'points2',case when m.kind='debate' or m.state='finished' then r.points2 else null end,
 'question',case when m.state='finished' and m.kind='quiz' then jsonb_build_object('prompt',t.prompt,'options',t.options,'answer',t.answer,'explanation',t.explanation) else null end) order by r.round),'[]'::jsonb)
 into history from private.mestre_pvp_rounds r left join private.mestre_pvp_questions t on t.id=m.questions[r.round] where r.match_id=m.id;
 return jsonb_build_object('id',m.id,'code',m.code,'kind',m.kind,'mode',m.mode,'subject',m.subject,'difficulty',m.difficulty,'state',m.state,
 'p1',m.p1,'p2',m.p2,'name1',(select display_name from public.mestre_educacao_profiles where user_id=m.p1),
 'name2',(select display_name from public.mestre_educacao_profiles where user_id=m.p2),'ready1',m.ready1,'ready2',m.ready2,
 'round',m.round,'score1',case when m.kind='debate' or m.state='finished' then m.score1 else null end,'score2',case when m.kind='debate' or m.state='finished' then m.score2 else null end,
 'focus1',case when u=m.p1 then m.focus1 else null end,'focus2',case when u=m.p2 then m.focus2 else null end,'deadline',m.deadline,'server_time',now(),'question',q,'my_choice',ownchoice,
 'opponent_ready',exists(select 1 from private.mestre_pvp_moves where match_id=m.id and round=m.round and user_id<>u),
 'history',history,'winner',m.winner,'ranked',m.ranked,'reason',m.reason);
end $$;

create function private.mestre_pvp(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.mestre_pvp_require();m private.mestre_pvp_matches;other uuid;b jsonb;k text;total int:=0;v int;qid bigint[];j jsonb;result jsonb;choice text;cost int;rk text;rm text;
begin
 if p_action is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Pedido inválido';end if;
 insert into private.mestre_pvp_builds(user_id) values(u) on conflict do nothing;
 if p_action='lobby' then
   -- Expire only the caller's stale rooms, without exposing anyone else's state.
   update private.mestre_pvp_matches set state='cancelled',reason='Convite expirado' where (p1=u or p2=u) and state in ('waiting','ready') and deadline<now();
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into j from (select p.user_id,p.display_name from public.mestre_educacao_profiles p where p.user_id<>u and private.mestre_can_play(p.user_id) order by p.display_name limit 100) x;
   select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into result from (
     select x.id,x.code,x.kind,x.mode,x.subject,x.state,x.round,x.winner,x.ranked,x.reason,x.created_at,
     (select display_name from public.mestre_educacao_profiles where user_id=case when x.p1=u then x.p2 else x.p1 end) as opponent,
     x.p1=u as creator from private.mestre_pvp_matches x where x.p1=u or x.p2=u order by x.created_at desc limit 40) x;
   return jsonb_build_object('user_id',u,'players',j,'matches',result,'build',(select attrs from private.mestre_pvp_builds where user_id=u));
 elsif p_action='build' then
   b:=p_data->'attrs';
   if b is null or jsonb_typeof(b)<>'object' or (select count(*) from jsonb_object_keys(b))<>7 then raise exception 'Distribua os sete atributos';end if;
   foreach k in array array['didatica','dominio','carisma','paciencia','argumentacao','percepcao','criatividade'] loop
     if not b?k or jsonb_typeof(b->k)<>'number' then raise exception 'Atributo inválido';end if;
     if (b->>k)::numeric<>trunc((b->>k)::numeric) then raise exception 'Use pontos inteiros';end if;
     v:=(b->>k)::int;if v<4 or v>18 then raise exception 'Cada atributo aceita de 4 a 18 pontos';end if;total:=total+v;
   end loop;
   if total<>70 then raise exception 'Distribua exatamente 70 pontos';end if;
   update private.mestre_pvp_builds set attrs=b where user_id=u;return jsonb_build_object('ok',true,'build',b);
 elsif p_action='ranking' then
   rk:=coalesce(p_data->>'kind','all');rm:=coalesce(p_data->>'mode','all');
   if rk not in ('all','quiz','debate') or rm not in ('all','async','live') then raise exception 'Filtro inválido';end if;
   with appearances as (
    select p1 as uid,winner from private.mestre_pvp_matches where state='finished' and ranked and (rk='all' or kind=rk) and (rm='all' or mode=rm)
    union all select p2,winner from private.mestre_pvp_matches where state='finished' and ranked and (rk='all' or kind=rk) and (rm='all' or mode=rm)
   ), standings as (
    select p.user_id,p.display_name,count(a.uid) as played,count(*) filter(where a.winner=p.user_id) as wins,
    count(*) filter(where a.winner is not null and a.winner<>p.user_id) as losses,count(a.uid) filter(where a.winner is null) as draws,
    count(*) filter(where a.winner=p.user_id)*30+count(a.uid) filter(where a.winner is null)*10 as points
    from public.mestre_educacao_profiles p left join appearances a on a.uid=p.user_id where private.mestre_can_play(p.user_id) group by p.user_id,p.display_name
   ), ordered as (select row_number() over(order by points desc,wins desc,played asc,user_id) as position,* from standings)
   select jsonb_build_object('top',coalesce((select jsonb_agg(to_jsonb(x) order by position) from (select * from ordered order by position limit 100)x),'[]'::jsonb),
   'me',(select to_jsonb(x) from ordered x where user_id=u)) into result;
   return result;
 elsif p_action='create' then
   perform pg_advisory_xact_lock(hashtextextended(u::text,1));
   if (select count(*) from private.mestre_pvp_matches where p1=u and created_at>now()-interval '1 hour')>=20 then raise exception 'Limite de 20 convites por hora';end if;
   if (select count(*) from private.mestre_pvp_matches where (p1=u or p2=u) and state in ('waiting','ready','active'))>=10 then raise exception 'Finalize ou cancele seus desafios antes de criar outro';end if;
   if p_data->>'kind' not in ('debate','quiz') or p_data->>'kind' is null or p_data->>'mode' not in ('async','live') or p_data->>'mode' is null then raise exception 'Modalidade inválida';end if;
   other:=nullif(p_data->>'opponent','')::uuid;
   if other=u then raise exception 'Escolha outro jogador';end if;
   if other is not null and not exists(select 1 from public.mestre_educacao_profiles where user_id=other and private.mestre_can_play(other)) then raise exception 'Jogador indisponível';end if;
   if p_data->>'mode'='async' and other is null then raise exception 'Escolha quem receberá o desafio';end if;
   if p_data->>'kind'='quiz' then
    if p_data->>'subject' not in ('portugues','matematica','historia','geografia','ciencias','ingles') then raise exception 'Matéria inválida';end if;
    v:=(p_data->>'difficulty')::int;if v is null or v not between 1 and 3 then raise exception 'Dificuldade inválida';end if;
    select array_agg(id) into qid from (select id from private.mestre_pvp_questions where subject=p_data->>'subject' and difficulty=v order by random() limit 5)x;
    if coalesce(cardinality(qid),0)<5 then raise exception 'Questões insuficientes nesta matéria';end if;
   else v:=1;qid:='{}';end if;
   insert into private.mestre_pvp_matches(code,kind,mode,subject,difficulty,p1,p2,questions,deadline)
   values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),p_data->>'kind',p_data->>'mode',case when p_data->>'kind'='debate' then 'debate' else p_data->>'subject' end,v,u,other,coalesce(qid,'{}'),now()+case when p_data->>'mode'='live' then interval '15 minutes' else interval '7 days' end) returning * into m;
   return private.mestre_pvp_view(m.id);
 elsif p_action='join' then
   select * into m from private.mestre_pvp_matches where code=upper(btrim(p_data->>'code')) for update;
   if not found or m.state<>'waiting' or m.mode<>'live' or m.deadline<now() then raise exception 'Sala indisponível ou código incorreto';end if;
   if m.p1=u or (m.p2 is not null and m.p2<>u) then raise exception 'Sala reservada para outro jogador';end if;
   if not private.mestre_can_play(m.p1) then raise exception 'Sala indisponível';end if;
   update private.mestre_pvp_matches set p2=u,state='ready',deadline=now()+interval '15 minutes' where id=m.id;
   return private.mestre_pvp_view(m.id);
 end if;
 if p_action not in ('get','accept','ready','cancel','resign','move') then raise exception 'Ação desconhecida';end if;
 select * into m from private.mestre_pvp_matches where id=(p_data->>'id')::uuid for update;
 if not found or u not in (m.p1,coalesce(m.p2,m.p1)) then raise exception 'Partida indisponível' using errcode='42501';end if;
 perform private.mestre_pvp_resolve(m.id);
 select * into m from private.mestre_pvp_matches where id=m.id;
 if p_action='accept' then
   if m.state<>'waiting' or m.mode<>'async' or m.p2<>u then raise exception 'Convite indisponível';end if;
   if not private.mestre_can_play(m.p1) then raise exception 'Desafiante bloqueado';end if;
   update private.mestre_pvp_matches set state='active',build1=coalesce((select attrs from private.mestre_pvp_builds where user_id=m.p1),(select attrs from private.mestre_pvp_builds where user_id=u)),
   build2=(select attrs from private.mestre_pvp_builds where user_id=u),deadline=now()+interval '48 hours' where id=m.id;
 elsif p_action='ready' then
   if m.state<>'ready' or m.mode<>'live' then raise exception 'Sala não está pronta';end if;
   update private.mestre_pvp_matches set ready1=ready1 or p1=u,ready2=ready2 or p2=u where id=m.id returning * into m;
   if m.ready1 and m.ready2 then
    if not private.mestre_can_play(m.p1) or not private.mestre_can_play(m.p2) then raise exception 'Jogador bloqueado';end if;
    update private.mestre_pvp_matches set state='active',build1=(select attrs from private.mestre_pvp_builds where user_id=m.p1),build2=(select attrs from private.mestre_pvp_builds where user_id=m.p2),deadline=now()+interval '45 seconds' where id=m.id;
   end if;
 elsif p_action='cancel' then
   if m.state not in ('waiting','ready') then raise exception 'A partida já começou';end if;
   update private.mestre_pvp_matches set state='cancelled',reason='Convite cancelado ou recusado' where id=m.id;
 elsif p_action='resign' then
   if m.state<>'active' then raise exception 'Partida não está ativa';end if;
   perform private.mestre_pvp_finish(m.id,'Desistência',case when m.p1=u then m.p2 else m.p1 end);
 elsif p_action='move' then
   if m.state<>'active' then raise exception 'Rodada encerrada';end if;
   if (p_data->>'round')::int is distinct from m.round then raise exception 'A rodada mudou. Atualize a partida';end if;
   if exists(select 1 from private.mestre_pvp_moves where match_id=m.id and round=m.round and user_id=u) then raise exception 'Sua jogada já foi enviada';end if;
   choice:=p_data->>'choice';
   if choice is null then raise exception 'Escolha uma jogada';end if;
   if m.kind='quiz' then if choice not in ('0','1','2','3') then raise exception 'Alternativa inválida';end if;
   else
     if choice not in ('argumentar','contra','preparar','improvisar') then raise exception 'Estratégia inválida';end if;
     cost:=case choice when 'argumentar' then 12 when 'contra' then 14 when 'improvisar' then 20 else -15 end;
     if (case when u=m.p1 then m.focus1 else m.focus2 end)<cost then raise exception 'Foco insuficiente: prepare a próxima rodada';end if;
     update private.mestre_pvp_matches set focus1=case when p1=u then least(100,focus1-cost) else focus1 end,focus2=case when p2=u then least(100,focus2-cost) else focus2 end where id=m.id;
   end if;
   insert into private.mestre_pvp_moves(match_id,round,user_id,choice) values(m.id,m.round,u,choice);
   perform private.mestre_pvp_resolve(m.id);
 end if;
 return private.mestre_pvp_view(m.id);
end $$;

-- Public entrypoint is invoker; only the checked dispatcher crosses the privilege boundary.
create function public.mestre_pvp(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.mestre_pvp(p_action,p_data) $$;
revoke all on function private.mestre_pvp_require(),private.mestre_pvp_finish(uuid,text,uuid),private.mestre_pvp_power(jsonb,text,text),private.mestre_pvp_resolve(uuid),private.mestre_pvp_view(uuid),private.mestre_pvp(text,jsonb),public.mestre_pvp(text,jsonb) from public,anon,authenticated;
grant execute on function private.mestre_pvp(text,jsonb),public.mestre_pvp(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
