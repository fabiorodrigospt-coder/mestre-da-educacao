-- Overall/career rankings. Read only: saves and competitive results are never modified.
create table private.mestre_simulated_players(
 user_id uuid primary key references auth.users(id) on delete cascade,
 previous_name text,
 created_at timestamptz not null default now()
);
alter table private.mestre_simulated_players enable row level security;
revoke all on private.mestre_simulated_players from public,anon,authenticated;
-- Register the already-authorized QA cohort using server-owned Auth identity, not editable names/metadata.
insert into private.mestre_simulated_players(user_id,previous_name)
select u.id,p.display_name from auth.users u join public.mestre_educacao_profiles p on p.user_id=u.id
where u.email like 'bot-qa-%@example.com' on conflict do nothing;
with roster as (
 select b.user_id,row_number() over(order by u.email) n from private.mestre_simulated_players b join auth.users u on u.id=b.user_id
), names as (select array['Ana Monteiro','Bruno Almeida','Clara Nogueira','Diego Martins','Elisa Duarte','Felipe Azevedo','Helena Costa','Igor Ribeiro','Júlia Tavares','Lucas Moreira'] a)
update public.mestre_educacao_profiles p set display_name=names.a[roster.n::integer]
from roster,names where p.user_id=roster.user_id and roster.n between 1 and 10;

create function private.mestre_rank_number(v jsonb, ceiling numeric default 1000000000)
returns numeric language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(v)<>'number' or v is null then return 0;end if;
 return least(ceiling,greatest(0,trunc(v::text::numeric)));
end $$;
create function private.mestre_rank_count(v jsonb, ceiling integer default 500)
returns numeric language sql immutable set search_path='' as $$
 select least(ceiling,count(distinct x))::numeric from jsonb_array_elements(case when jsonb_typeof(v)='array' then v else '[]'::jsonb end) x where jsonb_typeof(x)='string' and x#>>'{}'<>''
$$;
create function private.mestre_rank_metrics(s jsonb, online_points numeric, quiz_wins numeric)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object(
 'aulas',private.mestre_rank_number(s#>'{stats,wins}'),
 'debates',private.mestre_rank_number(s#>'{arena,wins}'),
 'desafios',private.mestre_rank_count(s#>'{bosses,defeated}',10),
 'projetos',private.mestre_rank_number(s#>'{stats,gangWins}'),
 'pvp',greatest(0,online_points),'perguntas',greatest(0,quiz_wins),
 'patrimonio',private.mestre_rank_number(s->'money')+private.mestre_rank_number(s->'bank')+private.mestre_rank_number(s#>'{economy,crewCash}'),
 'reputacao',private.mestre_rank_number(s->'respect'),'experiencia',private.mestre_rank_number(s->'xp'),
 'negocios',coalesce((select least(20,sum(private.mestre_rank_number(x->'count',5))) from jsonb_each(case when jsonb_typeof(s->'properties')='object' then s->'properties' else '{}'::jsonb end) e(k,x)),0),
 'escolas',private.mestre_rank_count(s#>'{territories,owned}',8),'equipe',private.mestre_rank_count(s->'members',20),
 'missoes',private.mestre_rank_count(s->'claimed'),
 'conquistas',private.mestre_rank_count(s#>'{daily,achievements}',100),
 'habilidades',coalesce((select least(99,sum(private.mestre_rank_number(x,3))) from jsonb_each(case when jsonb_typeof(s->'skills')='object' then s->'skills' else '{}'::jsonb end) e(k,x)),0),
 'atributos',private.mestre_rank_number(s#>'{attributes,intelligence}',1000)+private.mestre_rank_number(s#>'{attributes,strength}',1000)+private.mestre_rank_number(s#>'{attributes,charisma}',1000)+private.mestre_rank_number(s#>'{attributes,resistance}',1000),
 'comercio',private.mestre_rank_number(s#>'{commerce,profit}'),
 'premios',private.mestre_rank_number(s#>'{daily,total}',100000),
 'operacoes',private.mestre_rank_number(s#>'{crew,completed}'),
 'leiloes',private.mestre_rank_number(s#>'{commerce,auctionsWon}')
 )
$$;
-- Each component is public and inspectable. Square roots reduce raw money/XP dominance.
create function private.mestre_rank_components(m jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object(
 'aulas',floor(sqrt((m->>'aulas')::numeric)*100),
 'debates',floor(sqrt((m->>'debates')::numeric)*80),
 'desafios',(m->>'desafios')::numeric*300,
 'projetos',floor(sqrt((m->>'projetos')::numeric)*100),
 'pvp',floor(sqrt((m->>'pvp')::numeric)*50),
 'patrimonio',floor(sqrt((m->>'patrimonio')::numeric)/2),
 'reputacao',floor(sqrt((m->>'reputacao')::numeric)*4),
 'experiencia',floor(sqrt((m->>'experiencia')::numeric)*3),
 'negocios',(m->>'negocios')::numeric*70,
 'escolas',(m->>'escolas')::numeric*200,
 'equipe',(m->>'equipe')::numeric*50,
 'missoes',(m->>'missoes')::numeric*30,
 'conquistas',(m->>'conquistas')::numeric*50,
 'habilidades',(m->>'habilidades')::numeric*15,
 'atributos',floor(sqrt((m->>'atributos')::numeric)*10),
 'comercio',floor(sqrt((m->>'comercio')::numeric)/4),
 'premios',floor(sqrt((m->>'premios')::numeric)*30),
 'operacoes',floor(sqrt((m->>'operacoes')::numeric)*30),
 'leiloes',floor(sqrt((m->>'leiloes')::numeric)*40)
 )
$$;
create function private.mestre_rankings(p_category text default 'geral',p_cohort text default 'all',p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=(select auth.uid());result jsonb;
begin
 if u is null or not private.mestre_can_play(u) then raise exception 'Entre em uma conta ativa para ver o ranking' using errcode='42501';end if;
 if p_category is null or p_category not in('geral','aulas','debates','desafios','projetos','pvp','perguntas','patrimonio','reputacao','experiencia','negocios','escolas','equipe','missoes','conquistas','habilidades','atributos','comercio','premios','operacoes','leiloes') then raise exception 'Categoria inválida';end if;
 if p_cohort is null or p_cohort not in('all','players','simulated') or p_offset is null or p_offset<0 or p_offset>100000 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Filtro inválido';end if;
 with eligible_matches as (
  select f.* from private.mestre_pvp_matches f
  where f.state='finished' and f.ranked and private.mestre_can_play(f.p1) and private.mestre_can_play(f.p2)
  and exists(select 1 from private.mestre_simulated_players where user_id=f.p1)=exists(select 1 from private.mestre_simulated_players where user_id=f.p2)
 ), appearances as (
  select p1 uid,winner,kind from eligible_matches union all select p2,winner,kind from eligible_matches
 ), online as (
  select uid,count(*) filter(where winner=uid)*30+count(*) filter(where winner is null)*10 points,
  count(*) filter(where winner=uid and kind='quiz') quiz_wins from appearances group by uid
 ), base as (
  select p.user_id,p.display_name,s.updated_at as synced_at,
  exists(select 1 from private.mestre_simulated_players b where b.user_id=p.user_id) is_simulated,
  private.mestre_rank_metrics(s.game_state,coalesce(o.points,0),coalesce(o.quiz_wins,0)) metrics
  from public.mestre_educacao_profiles p join public.mestre_educacao_saves s on s.user_id=p.user_id
  left join online o on o.uid=p.user_id where private.mestre_can_play(p.user_id)
 ), components as (
  select *,private.mestre_rank_components(metrics) breakdown from base where p_cohort='all' or is_simulated=(p_cohort='simulated')
 ), scored as (
  select *,metrics||jsonb_build_object('geral',(select sum(v::numeric) from jsonb_each_text(breakdown)e(k,v))) all_metrics from components
 ), ordered as (
  select user_id,display_name,is_simulated,synced_at,all_metrics as metrics,breakdown,
   (all_metrics->>p_category)::numeric score,
   rank() over(order by (all_metrics->>p_category)::numeric desc) position,
   row_number() over(order by (all_metrics->>p_category)::numeric desc,lower(display_name),user_id) idx from scored
 )
 select jsonb_build_object('version',1,'generated_at',now(),'user_id',u,'category',p_category,'cohort',p_cohort,
 'total',(select count(*) from ordered),'offset',p_offset,'limit',p_limit,
 'top',coalesce((select jsonb_agg(to_jsonb(x)-'idx' order by idx) from (select * from ordered where idx>p_offset and idx<=p_offset+p_limit)x),'[]'::jsonb),
 'me',(select to_jsonb(x)-'idx' from ordered x where user_id=u),
 'notice','Carreira: último save sincronizado, sujeito a edição local. PvP: resultados validados no servidor. Personagens simulados são identificados e podem ser filtrados. A pontuação geral é um índice de progressão, não uma prova de habilidade absoluta.') into result;
 return result;
end $$;
create function public.mestre_rankings(p_category text default 'geral',p_cohort text default 'all',p_offset integer default 0,p_limit integer default 20)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.mestre_rankings(p_category,p_cohort,p_offset,p_limit) $$;
revoke all on function private.mestre_rank_number(jsonb,numeric),private.mestre_rank_count(jsonb,integer),private.mestre_rank_metrics(jsonb,numeric,numeric),private.mestre_rank_components(jsonb),private.mestre_rankings(text,text,integer,integer),public.mestre_rankings(text,text,integer,integer) from public,anon,authenticated;
grant execute on function private.mestre_rankings(text,text,integer,integer),public.mestre_rankings(text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
