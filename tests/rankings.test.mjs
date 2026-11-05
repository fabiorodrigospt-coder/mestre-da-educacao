import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
const db=new PGlite();const ids=Array.from({length:6},(_,i)=>`10000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
async function asUser(id,sql,params=[]){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);try{return await db.query(sql,params);}finally{await db.exec('reset role');}}
const rank=async(id=ids[0],category='geral',cohort='all',offset=0,limit=20)=>(await asUser(id,'select public.mestre_rankings($1,$2,$3,$4) data',[category,cohort,offset,limit])).rows[0].data;
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,private to authenticated;grant execute on function auth.uid() to authenticated;
 create table public.mestre_educacao_profiles(user_id uuid primary key,display_name text,status text default 'active');
 create table public.mestre_educacao_saves(user_id uuid primary key,game_state jsonb,updated_at timestamptz default now());
 alter table public.mestre_educacao_saves enable row level security;grant select on public.mestre_educacao_saves to authenticated;
 create policy own_save on public.mestre_educacao_saves for select to authenticated using(user_id=auth.uid());
 create function private.mestre_can_play(u uuid) returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select status='active' from public.mestre_educacao_profiles where user_id=u),false) $$;
 create table private.mestre_pvp_matches(p1 uuid,p2 uuid,winner uuid,kind text,state text,ranked boolean);
 revoke all on private.mestre_pvp_matches from public,anon,authenticated;
 `);
 const states=[{xp:100,respect:400,money:10000,bank:0,stats:{wins:25,gangWins:4},arena:{wins:9},bosses:{defeated:['urso','urso','viuva']},claimed:['a','b','a'],attributes:{intelligence:10,strength:10,charisma:10,resistance:10}},
 {money:1000000,stats:{wins:25}}, {money:99999999,stats:{wins:999999}},
 {stats:{wins:100}}, {stats:{wins:150}},
 {money:-5,stats:{wins:'999'},claimed:{fake:true},attributes:null,properties:['bad'],skills:null,log:['PRIVATE_SENTINEL'],email:'PRIVATE_EMAIL@example.com'}];
 for(let i=0;i<6;i++){await db.query('insert into auth.users values($1,$2)',[ids[i],i===3||i===4?`bot-qa-fixture-${i}@example.com`:`player${i}@example.com`]);await db.query('insert into public.mestre_educacao_profiles values($1,$2,$3)',[ids[i],i===3||i===4?'[BOT QA] '+i:'Player '+i,i===2?'banned':'active']);await db.query('insert into public.mestre_educacao_saves(user_id,game_state) values($1,$2)',[ids[i],JSON.stringify(states[i])]);}
 await db.query("insert into private.mestre_pvp_matches values($1,$2,$1,'debate','finished',true),($1,$2,null,'quiz','finished',true),($1,$2,$1,'quiz','finished',false),($1,$3,$1,'debate','finished',true),($3,$4,$3,'debate','finished',true)",[ids[0],ids[1],ids[3],ids[4]]);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261105075605_overall_rankings.sql',import.meta.url),'utf8'));
});after(()=>db.close());
test('ranking por aulas usa acertos, mantém empates e exclui banidos',async()=>{const r=await rank(ids[0],'aulas','players');assert.equal(r.total,3);assert.equal(r.top[0].score,25);assert.equal(r.top[1].score,25);assert.equal(r.top[0].position,1);assert.equal(r.top[1].position,1);assert.ok(!r.top.some(p=>p.user_id===ids[2]));});
test('personagens têm nomes fictícios e coorte imutável pelo cliente',async()=>{const r=await rank(ids[0],'aulas','simulated');assert.equal(r.total,2);assert.ok(r.top.every(p=>p.is_simulated&&!p.display_name.includes('BOT')));const humans=await rank(ids[0],'aulas','players');assert.ok(humans.top.every(p=>!p.is_simulated));await assert.rejects(asUser(ids[0],'select * from private.mestre_simulated_players'),/permission denied/);});
test('pontuação geral é soma exata das parcelas publicadas',async()=>{const r=await rank();for(const p of r.top){assert.equal(p.score,Object.values(p.breakdown).reduce((a,b)=>a+Number(b),0));assert.equal(p.score,p.metrics.geral);}const a=r.top.find(p=>p.user_id===ids[0]);assert.equal(a.breakdown.aulas,500);assert.equal(a.breakdown.debates,240);assert.equal(a.breakdown.desafios,600);assert.equal(a.breakdown.missoes,60);assert.equal(a.metrics.pvp,40);});
test('PvP ignora resultados não ranqueados e confrontos humano-simulado',async()=>{const r=await rank(ids[0],'pvp');const a=r.top.find(p=>p.user_id===ids[0]);assert.equal(a.score,40);assert.equal(a.metrics.perguntas,0);assert.equal(r.top.find(p=>p.user_id===ids[3]).score,30);});
test('dados malformados, negativos e duplicados não derrubam o ranking',async()=>{const r=await rank();const malformed=r.top.find(p=>p.user_id===ids[5]);assert.equal(malformed.metrics.aulas,0);assert.equal(malformed.metrics.patrimonio,0);assert.equal(malformed.metrics.missoes,0);assert.equal(r.top.find(p=>p.user_id===ids[0]).metrics.desafios,2);});
test('resposta pública não expõe saves, e-mails ou logs privados',async()=>{const r=await rank();const encoded=JSON.stringify(r);assert.ok(!encoded.includes('PRIVATE_SENTINEL'));assert.ok(!encoded.includes('PRIVATE_EMAIL'));assert.ok(!encoded.includes('game_state'));assert.ok(!encoded.includes('@example.com'));const own=await asUser(ids[0],'select * from public.mestre_educacao_saves');assert.equal(own.rows.length,1);});
test('paginação mantém minha posição fora da página e ordenação estável',async()=>{const full=await rank(ids[0],'aulas','all');const page=await rank(ids[0],'aulas','all',0,1);assert.equal(page.top.length,1);assert.equal(page.me.user_id,ids[0]);assert.ok(page.me.position>1);assert.deepEqual(page.top,full.top.slice(0,1));});
test('contas bloqueadas, visitantes e filtros inválidos são negados',async()=>{await assert.rejects(rank(ids[2]),/conta ativa/);await assert.rejects(rank(ids[0],'aulas;drop table x'),/Categoria/);await assert.rejects(rank(ids[0],'aulas','other'),/Filtro/);await assert.rejects(rank(ids[0],'aulas','all',-1),/Filtro/);await db.exec('set role anon');await assert.rejects(db.query('select public.mestre_rankings()'),/permission denied/);await db.exec('reset role');});
