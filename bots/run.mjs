import {createEngine,debateChoice} from './engine.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID,createHash} from 'node:crypto';
const scope={window:{}};vm.runInNewContext(readFileSync(new URL('../config.js',import.meta.url),'utf8'),scope);
const cfg=scope.window.MESTRE_CONFIG;
const BASE='https://wsxmrysizwetxxshxwan.supabase.co';
if(cfg.supabaseUrl!==BASE)throw Error('Projeto inesperado: execução interrompida');
const accounts=JSON.parse(process.env.MESTRE_BOT_ACCOUNTS||'[]');
if(accounts.length!==10||new Set(accounts.map(b=>b.id)).size!==10||accounts.some(b=>!b.email?.startsWith('bot-qa-')||!b.id||!b.password||b.intelligence<.2||b.intelligence>.95))throw Error('Configure exatamente dez contas BOT QA exclusivas');
const duration=Math.max(15,Math.min(180,Number(process.env.BOT_SESSION_SECONDS)||120));
const report={started_at:new Date().toISOString(),engine_sha256:createHash('sha256').update(readFileSync(new URL('../index.html',import.meta.url))).digest('hex'),bots:[],matches:[],errors:[]};
const clients=[];
function error(code){report.errors.push({at:new Date().toISOString(),code});}
async function api(path,body,token,method='POST',extra={}){
 const res=await fetch(BASE+path,{method,headers:{apikey:cfg.supabasePublishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...extra},body:method==='GET'?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await res.json().catch(()=>null);
 if(!res.ok)throw Error(`HTTP_${res.status}_${data?.code||data?.error_code||'API'}`);return data;
}
async function rpc(c,action,data={}){return api('/rest/v1/rpc/mestre_pvp',{p_action:action,p_data:data},c.token);}
const bounded=s=>{for(const k of ['xp','money','bank','respect','energy','heat'])if(!Number.isFinite(s[k])||s[k]<0)throw Error('INVALID_'+k);if(s.energy>100||s.heat>100)throw Error('INVALID_LIMIT');};
try{
 for(let i=0;i<accounts.length;i++){
  const b=accounts[i];try{
   const auth=await api('/auth/v1/token?grant_type=password',{email:b.email,password:b.password});
   if(auth.user?.id!==b.id)throw Error('IDENTITY_MISMATCH');
   const access=await api('/rest/v1/rpc/mestre_player_access',{},auth.access_token);
   if(access.status!=='active')throw Error('BOT_NOT_ACTIVE');
   const rows=await api('/rest/v1/mestre_educacao_saves?select=game_state,revision,admin_revision&user_id=eq.'+b.id,undefined,auth.access_token,'GET');
   const row=rows[0],engine=createEngine(row?.game_state),meta=row?.game_state?.bot_test||{sessions:0,active_ms:0,milestones:{},created_at:new Date().toISOString()};
   const c={id:b.id,token:auth.access_token,intelligence:b.intelligence,engine,row,meta,actions:{},label:'BOT QA '+String(i+1).padStart(2,'0')};
   c.before=engine.metrics();clients.push(c);
  }catch{error('BOT_'+(i+1)+'_LOGIN_OR_LOAD_FAILED');}
 }
 // Real elapsed time: no clock acceleration, no artificial resources or XP.
 const end=Date.now()+duration*1000;let nextAction=0;const start=Date.now();
 while(Date.now()<end){
  for(const c of clients){try{c.engine.tick();if(Date.now()>=nextAction){const a=c.engine.step(c.intelligence);c.actions[a]=(c.actions[a]||0)+1;}bounded(c.engine.metrics());}catch{c.failed=true;error(c.label+'_ENGINE_ERROR');}}
  if(Date.now()>=nextAction)nextAction=Date.now()+15000;
  await new Promise(r=>setTimeout(r,1000));
 }
 for(const c of clients){
  if(c.failed)continue;
  try{
   const metrics=c.engine.metrics(),elapsed=Date.now()-start;
   c.meta.sessions++;c.meta.active_ms=metrics.active_ms;
   const priorLevel=c.before.level;for(let l=priorLevel+1;l<=metrics.level;l++)c.meta.milestones[l]={at:new Date().toISOString(),active_ms:c.meta.active_ms,wall_ms:Date.now()-Date.parse(c.meta.created_at)};
   const state=c.engine.state();state.bot_test=c.meta;
   const revision=c.row?.revision||0;
   const path='/rest/v1/mestre_educacao_saves'+(revision?'?user_id=eq.'+c.id+'&revision=eq.'+revision:'');
   const body={game_state:state,revision:revision+1,...(revision?{ack_admin_revision:c.row.admin_revision||0,updated_at:new Date().toISOString()}:{user_id:c.id})};
   const saved=await api(path,body,c.token,revision?'PATCH':'POST',{Prefer:'return=representation'});
   if(saved.length!==1)throw Error('SAVE_CONFLICT');
   const summary={engine_sha256:report.engine_sha256,bot:c.label,intelligence:c.intelligence,...metrics,session_ms:Math.max(0,metrics.active_ms-c.before.active_ms),total_active_ms:c.meta.active_ms,sessions:c.meta.sessions,wall_ms:Date.now()-Date.parse(c.meta.created_at),milestones:c.meta.milestones,actions:c.actions,delta_xp:metrics.xp-c.before.xp};
   report.bots.push(summary);
   await api('/rest/v1/rpc/mestre_activity_submit',{p_events:[{id:randomUUID(),at:new Date().toISOString(),action:'bot_session',label:c.label+' · evolução automática',details:summary}]},c.token);
  }catch{error(c.label+'_SAVE_OR_TELEMETRY_FAILED');}
 }
 // Five bot-only server-authoritative debates; resume pending pair matches first.
 const byId=new Map(clients.map(c=>[c.id,c]));
 for(let i=0;i+1<clients.length;i+=2){const a=clients[i],b=clients[i+1];try{
  const lobby=await rpc(a,'lobby');
  const open=lobby.matches.filter(m=>['waiting','ready','active'].includes(m.state));
  let match;
  for(const m of open){const candidate=await rpc(a,'get',{id:m.id});if(candidate.p1===a.id&&candidate.p2===b.id){match=candidate;break;}}
  if(!match)match=await rpc(a,'create',{kind:'debate',mode:'async',opponent:b.id});
  if(!byId.has(match.p1)||!byId.has(match.p2))throw Error('NON_BOT_OPPONENT');
  if(match.state==='waiting')match=await rpc(byId.get(match.p2),'accept',{id:match.id});
  for(let turn=0;turn<100&&match.state==='active';turn++){
   for(const player of [byId.get(match.p1),byId.get(match.p2)]){
    match=await rpc(player,'get',{id:match.id});if(match.state!=='active')break;
    if(match.my_choice!==null)continue;
    const mine=player.id===match.p1;const last=match.history.at(-1);
    const choice=debateChoice(mine?match.focus1:match.focus2,player.intelligence,last?(mine?last.move2:last.move1):null);
    match=await rpc(player,'move',{id:match.id,round:match.round,choice});
   }
  }
  report.matches.push({id:match.id,state:match.state,round:match.round,score1:match.score1,score2:match.score2});
  if(match.state!=='finished')error('MATCH_NOT_FINISHED');
 }catch{error('PAIR_'+(i/2+1)+'_PVP_FAILED');}}
}finally{
 report.finished_at=new Date().toISOString();mkdirSync('bot-reports',{recursive:true});writeFileSync('bot-reports/latest.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({bots_saved:report.bots.length,matches:report.matches.length,errors:report.errors.length}));
 if(report.errors.length||report.bots.length!==10)process.exitCode=1;
}
