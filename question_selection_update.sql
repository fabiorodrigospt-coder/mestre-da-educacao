begin;
-- Canonical question content remains in the private bank, never in this public file.
create function private.mestre_quiz_pick(p_user uuid,p_other uuid,p_subject text,p_difficulty int)
returns bigint[] language plpgsql security definer set search_path='' as $$
declare picked bigint[];
begin
 perform pg_advisory_xact_lock(hashtextextended(least(p_user::text,coalesce(p_other::text,p_user::text))||greatest(p_user::text,coalesce(p_other::text,p_user::text)),8));
 with seen as (
  select used.question_id,max(coalesce(m.finished_at,m.created_at)) as last_seen
  from private.mestre_pvp_matches m cross join lateral unnest(m.questions) as used(question_id)
  where m.kind='quiz' and m.subject=p_subject and m.difficulty=p_difficulty and m.build1 is not null
   and ((p_other is null and (m.p1=p_user or m.p2=p_user))
     or (p_other is not null and ((m.p1=p_user and m.p2=p_other) or (m.p1=p_other and m.p2=p_user))))
  group by used.question_id
 ), selected as (
  select q.id from private.mestre_pvp_questions q left join seen s on s.question_id=q.id
  where q.subject=p_subject and q.difficulty=p_difficulty
  order by s.last_seen asc nulls first,random() limit 5
 )
 select array_agg(id order by random()) into picked from selected;
 if coalesce(cardinality(picked),0)<5 then raise exception 'Questões insuficientes nesta matéria';end if;
 return picked;
end $$;
revoke all on function private.mestre_quiz_pick(uuid,uuid,text,int) from public,anon,authenticated;

-- Patch only the reviewed selection clauses; abort if the dispatcher changed.
do $patch$
declare src text:=pg_get_functiondef('private.mestre_pvp(text,jsonb)'::regprocedure);
old_create text:='select array_agg(id) into qid from (select id from private.mestre_pvp_questions where subject=p_data->>''subject'' and difficulty=v order by random() limit 5)x;';
old_async text:='build2=(select attrs from private.mestre_pvp_builds where user_id=u),deadline=now()+interval ''48 hours'' where id=m.id;';
old_live text:='build2=(select attrs from private.mestre_pvp_builds where user_id=m.p2),deadline=now()+interval ''45 seconds'' where id=m.id;';
begin
 if position(old_create in src)=0 or position(old_async in src)=0 or position(old_live in src)=0 then raise exception 'O código de seleção mudou: revisão necessária antes de aplicar';end if;
 src:=replace(src,old_create,'qid:=private.mestre_quiz_pick(u,other,p_data->>''subject'',v);');
 src:=replace(src,old_async,'build2=(select attrs from private.mestre_pvp_builds where user_id=u),questions=case when m.kind=''quiz'' then private.mestre_quiz_pick(m.p1,m.p2,m.subject,m.difficulty) else m.questions end,deadline=now()+interval ''48 hours'' where id=m.id;');
 src:=replace(src,old_live,'build2=(select attrs from private.mestre_pvp_builds where user_id=m.p2),questions=case when m.kind=''quiz'' then private.mestre_quiz_pick(m.p1,m.p2,m.subject,m.difficulty) else m.questions end,deadline=now()+interval ''45 seconds'' where id=m.id;');
 execute src;
end $patch$;
notify pgrst,'reload schema';
commit;
