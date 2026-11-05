/* Mestre da Educação: acesso administrativo independente da interface do jogo.
   A UI não concede privilégios: toda consulta e escrita passa pelas RPCs protegidas do Supabase.
*/
(() => {
  'use strict';
  const cfg = window.MESTRE_CONFIG || {};
  const BASE = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  const KEY = String(cfg.supabasePublishableKey || '');
  const AUTH_KEY = 'mestre_admin_session_tab_v1';
  window.GameRankingClient={canPlay:()=>!!session?.access_token,rankings:data=>api('/rest/v1/rpc/mestre_rankings','POST',data)};
  document.getElementById('adminRankingBtn').addEventListener('click',()=>window.GameRanking?.open());
  const $ = id => document.getElementById(id);
  const elems = ['money','bank','respect','energy','xp','heat','intelligence','strength','charisma','resistance','arena_rating'];
  const attributeNames = new Set(['intelligence','strength','charisma','resistance']);
  let session = null;
  let players = [];
  let selected = null;
  let currentSearch = '';
  let searchTimer = 0;
  let loading = false;
  const numeric = n => Number.isFinite(Number(n)) ? Number(n) : 0;
  const date = d => d ? new Date(d).toLocaleString('pt-BR') : 'Não registrado';
  const safeString = v => String(v == null ? '' : v);
  function report(msg, danger=false) {
    $('notice').textContent = msg;
    $('notice').classList.toggle('error',danger);
  }
  function loginReport(msg) { $('loginMessage').textContent=msg; }
  function saveSession() {
    try { if(session) sessionStorage.setItem(AUTH_KEY,JSON.stringify(session));
      else sessionStorage.removeItem(AUTH_KEY); } catch(_) {}
  }
  function showLoggedIn(ok) {
    $('loginPanel').hidden=ok;
    $('dashboard').hidden=!ok;
    $('logout').hidden=!ok;
  }
  async function api(path, method='POST', body={}, authorized=true, retry=true) {
    if(!BASE || !KEY) throw new Error('Configuração pública do Supabase indisponível.');
    const headers={apikey:KEY,'Content-Type':'application/json'};
    if(authorized) {
      if(!session?.access_token) throw new Error('Entre novamente no painel.');
      if(Date.now()>=session.expires_at-45000 && retry) await refresh();
      headers.Authorization='Bearer '+session.access_token;
    }
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),16000);
    try{
      const res=await fetch(BASE+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(body),signal:ctrl.signal});
      const raw=await res.text();
      let data;try{data=raw?JSON.parse(raw):null;}catch(_){data=null;}
      if(!res.ok) {
        if(res.status===401 && authorized && retry && session?.refresh_token){
          await refresh();
          return api(path,method,body,authorized,false);
        }
        const detail=safeString(data?.message||data?.msg||data?.error_description||data?.error||res.statusText);
        throw new Error(detail||'Falha HTTP '+res.status);
      }
      return data;
    } catch(err) {
      if(err?.name==='AbortError') throw new Error('Tempo de conexão esgotado.');
      throw err;
    } finally{clearTimeout(timer);}
  }
  async function refresh(){
    if(!session?.refresh_token) throw new Error('Sessão expirada. Faça login novamente.');
    const next=await api('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:session.refresh_token},false);
    if(!next?.access_token) throw new Error('Falha ao renovar a sessão.');
    session={...session,access_token:next.access_token,refresh_token:next.refresh_token||session.refresh_token,
      expires_at:Date.now()+Number(next.expires_in||3600)*1000};
    saveSession();
  }
  async function signIn(e) {
    e.preventDefault();
    const btn=$('loginForm').querySelector('[type=submit]');
    btn.disabled=true;loginReport('Validando conta e privilégios no servidor...');
    try{
      const auth=await api('/auth/v1/token?grant_type=password','POST',
        {email:$('email').value.trim().toLowerCase(),password:$('password').value},false);
      if(!auth?.access_token || !auth?.user?.id) throw new Error('Autenticação não concluída.');
      session={access_token:auth.access_token,refresh_token:auth.refresh_token,
        expires_at:Date.now()+Number(auth.expires_in||3600)*1000,user_id:auth.user.id};
      $('password').value='';
      // A consulta exige que o usuário conste da tabela privada de administradores.
      const result=await api('/rest/v1/rpc/mestre_admin_dashboard','POST',{p_search:'',p_limit:60});
      saveSession();showLoggedIn(true);renderDashboard(result);
      loginReport('');
    }catch(err){
      session=null;saveSession();
      loginReport('Acesso recusado: '+err.message+'. Verifique se sua conta recebeu permissão administrativa.');
    }finally{btn.disabled=false;}
  }
  async function signOut(){
    const token=session?.access_token;
    session=null;saveSession();showLoggedIn(false);selected=null;players=[];
    $('activityPanel').hidden=true;activityGeneration++;$('activityEvents').replaceChildren();$('activityPvp').replaceChildren();$('loginForm').reset();loginReport('Sessão administrativa encerrada.');
    if(token) fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token}}).catch(()=>{});
  }
  function make(tag,className='',value=''){
    const el=document.createElement(tag);
    if(className)el.className=className;
    el.textContent=safeString(value);
    return el;
  }
  function renderDashboard(result){
    if(!result || !Array.isArray(result.players)) throw new Error('Resposta administrativa inválida.');
    players=result.players;
    $('totalCount').textContent=safeString(result.total);
    $('activeCount').textContent=safeString(result.active);
    $('blockedCount').textContent=safeString(result.blocked);
    const list=$('players');list.replaceChildren();
    $('emptyPlayers').textContent=players.length?'':'Nenhum jogador encontrado.';
    for(const p of players){
      const button=make('button','player'+(p.user_id===selected?.user_id?' selected':''),'');
      button.type='button';
      const state=p.status==='banned'?'Banido':p.status==='suspended'?'Suspenso':'Ativo';
      button.append(make('strong','',p.display_name || 'Jogador'),make('small','',p.email||'Sem e-mail'),
        make('small','',state+' · '+(p.revision==null?'Sem partida':'Save nº '+p.revision)));
      button.addEventListener('click',()=>pickPlayer(p.user_id));
      list.append(button);
    }
    if(selected){
      const next=players.find(p=>p.user_id===selected.user_id);
      if(next)pickPlayer(next.user_id);
      else clearSelection();
    }
  }
  async function showBots(){
    const panel=$('botPanel');panel.hidden=false;const out=$('botMetrics');out.replaceChildren(make('p','','Carregando métricas registradas...'));
    try{
      const data=await api('/rest/v1/rpc/mestre_rankings','POST',{p_category:'geral',p_cohort:'simulated',p_offset:0,p_limit:100});
      const bots=data.top;
      out.replaceChildren();
      out.append(make('p','','Sessões programadas: 2 minutos por hora. Tempo ativo difere do tempo corrido. Dados da carreira são relatos do motor; resultados PvP são validados no servidor. Ausência de erro registrado não comprova ausência de falhas.'));
      for(const b of bots){
        const activity=await api('/rest/v1/rpc/mestre_admin_activity','POST',{p_user_id:b.user_id,p_before:null});
        const recent=activity.events.find(e=>e.action==='bot_session');const card=make('article','panel','');
        card.append(make('h3','',b.display_name));
        if(!recent)card.append(make('p','','Conta criada; primeira sessão ainda não registrada.'));
        else{const d=recent.details;card.append(make('p','',`Decisão: ${Math.round(d.intelligence*100)}% · XP ${d.xp} · Nível ${d.level} · Patente ${d.rank}`));
          card.append(make('p','',`Sessões: ${d.sessions} · Tempo ativo: ${(d.total_active_ms/60000).toFixed(1)} min · Tempo corrido: ${(d.wall_ms/3600000).toFixed(1)} h`));
          card.append(make('p','',`Aulas: ${d.wins} concluídas / ${d.losses} falhas · XP nesta sessão: ${d.delta_xp} · Energia ${Math.floor(d.energy)} · Estresse ${d.heat}`));
          card.append(make('small','',`Último registro: ${date(recent.received_at)} · Motor ${String(d.engine_sha256||'').slice(0,12)}`));
          for(const [level,m] of Object.entries(d.milestones||{}))card.append(make('p','',`Nível ${level}: ${(m.active_ms/60000).toFixed(1)} min ativos / ${(m.wall_ms/3600000).toFixed(1)} h corridas`));
        }
        const button=make('button','small','Abrir ficha e histórico');button.onclick=()=>pickPlayer(b.user_id);card.append(button);out.append(card);
      }
      if(!bots.length)out.append(make('p','','Nenhuma conta BOT QA cadastrada.'));
    }catch{out.replaceChildren(make('p','error','Não foi possível carregar as métricas. Verifique a sessão administrativa.'));}
  }
  $('botsBtn').addEventListener('click',showBots);
  $('closeBots').addEventListener('click',()=>{$('botPanel').hidden=true;});
  function clearSelection(){
    selected=null;$('activityBtn').disabled=true;$('activityPanel').hidden=true;activityGeneration++;$('selectedName').textContent='';$('selectedId').textContent='';
    $('lastSeen').textContent='';$('editForm').hidden=true;
    $('noSave').textContent='Escolha um jogador para consultar sua partida.';
    $('playerStatus').textContent='Selecione uma conta';
    for(const id of ['suspend','ban','unban']) $(id).disabled=true;
    $('moderationInfo').textContent='';
  }
  function pickPlayer(id) {
    const p=players.find(x=>x.user_id===id);
    if(!p)return;
    selected=p;$('activityBtn').disabled=false;$('activityPanel').hidden=true;activityGeneration++;
    document.querySelectorAll('.player').forEach(b=>b.classList.toggle('selected',
      b.querySelector('strong')?.textContent===p.display_name &&
      b.querySelector('small')?.textContent===p.email));
    $('selectedName').textContent=p.display_name||'Jogador';
    $('selectedId').textContent='ID '+p.user_id;
    $('lastSeen').textContent='Cadastro: '+date(p.created_at)+' · Último login: '+date(p.last_sign_in_at)+
      ' · Save: '+date(p.save_updated_at);
    $('playerStatus').textContent=p.status==='banned'?'Banido':p.status==='suspended'?'Suspenso':'Ativo';
    $('playerStatus').classList.toggle('blocked',p.status!=='active');
    $('moderationInfo').textContent=p.status==='suspended'?'Suspensão até '+date(p.suspended_until)+
      ' · Motivo: '+safeString(p.moderation_reason):p.status==='banned'?'Banimento: '+safeString(p.moderation_reason):'Conta liberada para jogar.';
    for(const id of ['suspend','ban']) $(id).disabled=p.status==='banned';
    $('unban').disabled=p.status==='active';
    if(p.revision==null) {
      $('editForm').hidden=true;
      $('noSave').textContent='O jogador está cadastrado, mas ainda não possui partida salva.';
    } else {
      $('editForm').hidden=false;$('noSave').textContent='';
      fillFields();
    }
  }
  function fillFields(){
    if(!selected)return;
    for(const key of elems){
      const v=attributeNames.has(key)?selected.attributes?.[key]:selected[key];
      $('editForm').elements.namedItem(key).value=safeString(v==null?0:v);
    }
    $('editForm').elements.namedItem('reason').value='Ajuste administrativo de progresso';
  }
  async function loadDashboard(keepSelection=true){
    if(loading)return;
    loading=true;$('refreshBtn').disabled=true;
    const oldId=keepSelection?selected?.user_id:null;
    try {
      const result=await api('/rest/v1/rpc/mestre_admin_dashboard','POST',{p_search:currentSearch,p_limit:100});
      if(!keepSelection) selected=null;
      renderDashboard(result);
      if(oldId && players.some(p=>p.user_id===oldId))pickPlayer(oldId);
      report('Dados sincronizados com o Supabase.');
    } catch(err){report('Erro ao atualizar lista: '+err.message,true);}
    finally{loading=false;$('refreshBtn').disabled=false;}
  }
  async function applyEdits(e){
    e.preventDefault();if(!selected || selected.revision==null)return;
    const p=selected;
    const patch={};let edited=0;
    for(const key of elems){
      const v=Number($('editForm').elements.namedItem(key).value);
      const prev=numeric(attributeNames.has(key)?p.attributes?.[key]:p[key]);
      if(!Number.isFinite(v))return report('Valor não numérico: '+key,true);
      if(v!==prev){
        if(attributeNames.has(key)){(patch.attributes ||= {})[key]=v;}
        else patch[key]=v;
        edited++;
      }
    }
    if(!edited)return report('Nenhum campo foi alterado.');
    const reason=$('editForm').elements.namedItem('reason').value.trim();
    if(reason.length<3)return report('Informe o motivo da alteração.',true);
    if(!confirm('Aplicar '+edited+' alteração(ões) na partida de '+p.display_name+'? O save será atualizado na nuvem.'))return;
    try{
      await api('/rest/v1/rpc/mestre_admin_edit_player','POST',
        {p_user_id:p.user_id,p_patch:patch,p_expected_revision:p.revision,p_reason:reason});
      report('Atributos salvos. A alteração foi registrada no histórico.');
      await loadDashboard();
    }catch(err){report('Não foi possível aplicar as alterações: '+err.message,true);}
  }
  async function moderate(action){
    if(!selected)return;
    const p=selected;
    let duration=null, verb;
    if(action==='suspend'){
      const value=prompt('Suspensão de '+p.display_name+'. Informe a duração em MINUTOS (1 a 43200). Ex.: 60 = 1 hora, 1440 = 1 dia.','60');
      if(value===null)return;
      duration=Number(value);
      if(!Number.isInteger(duration)||duration<1||duration>43200) return report('Duração inválida: de 1 minuto a 30 dias.',true);
      verb='Suspender';
    }else verb=action==='ban'?'Banir':'Reativar';
    const reason=prompt('Motivo da ação '+verb.toLowerCase()+' (será registrado no histórico):',
      action==='unban'?'Reativação autorizada':'Moderação de conta');
    if(reason===null)return;
    if(reason.trim().length<3 || reason.length>240)return report('Motivo deve conter 3 a 240 caracteres.',true);
    if(!confirm(verb+' '+p.display_name+'?'+(duration?' Por '+duration+' minuto(s).':'')))return;
    try{
      await api('/rest/v1/rpc/mestre_admin_moderate','POST',
        {p_user_id:p.user_id,p_action:action,p_duration_minutes:duration,p_reason:reason.trim()});
      report('Moderação aplicada com sucesso.');await loadDashboard();
    }catch(err){report('Erro na moderação: '+err.message,true);}
  }
  async function showHistory(all=false){
    try{
      const data=await api('/rest/v1/rpc/mestre_admin_history','POST',{p_user_id:all?null:selected?.user_id||null});
      const box=$('history');box.replaceChildren();
      if(!Array.isArray(data)||!data.length)box.append(make('p','muted','Ainda não há ações registradas.'));
      for(const log of data||[]){
        const item=make('div','history','');
        item.append(make('strong','',log.action+' · '+date(log.created_at)),
          make('small','',log.reason+' · Jogador: '+log.target_id),
          make('div','mono','Antes: '+JSON.stringify(log.old_values)),
          make('div','mono','Depois: '+JSON.stringify(log.new_values)));
        box.append(item);
      }
      $('historyPanel').hidden=false;
      $('historyPanel').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){report('Não foi possível consultar auditoria: '+err.message,true);}
  }
  let activityCursor=null,activityGeneration=0,activityLoading=false;
  const amount=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
  async function showActivity(more=false){
    if(!selected||activityLoading)return;
    const target=selected.user_id,gen=++activityGeneration,name=selected.display_name;
    activityLoading=true;$('activityRefresh').disabled=true;$('activityMore').disabled=true;
    try{
      const data=await api('/rest/v1/rpc/mestre_admin_activity','POST',{p_user_id:target,p_before:more?activityCursor:null});
      if(gen!==activityGeneration||selected?.user_id!==target)return;
      $('activityTitle').textContent='Atividade: '+name;$('activityNotice').textContent=data.notice;
      if(!more)$('activityEvents').replaceChildren();
      let failures=0,training=0,purchases=0,totalLoss=0;
      for(const ev of data.events){
        const d=ev.details||{},before=d.before||{},after=d.after||{};
        if(Number(after.losses)>Number(before.losses))failures++;
        if(ev.action==='train')training++;if(['item','buy-consumable','business','upgrade'].includes(ev.action))purchases++;
        const loss=Math.max(0,Number(before.money||0)-Number(after.money||0));if(Number(after.losses)>Number(before.losses))totalLoss+=loss;
        const card=make('div','history');card.append(make('strong','',ev.label||ev.action),make('small','',date(ev.occurred_at)+' · recebido: '+date(ev.received_at)+' · '+ev.action+(ev.target?' / '+ev.target:'')));
        const changes=[];
        for(const [key,label] of Object.entries({money:'Dinheiro',bank:'Banco',energy:'Energia',respect:'Reputação',xp:'XP',heat:'Estresse'}))
          if(before[key]!=null&&after[key]!=null&&before[key]!==after[key])changes.push(label+': '+amount(before[key])+' → '+amount(after[key]));
        for(const [key,label] of Object.entries({intelligence:'Didática',strength:'Domínio',charisma:'Carisma',resistance:'Paciência'}))
          if(before.attributes?.[key]!=null&&after.attributes?.[key]!=null&&before.attributes[key]!==after.attributes[key])changes.push(label+': '+amount(before.attributes[key])+' → '+amount(after.attributes[key]));
        card.append(make('p','',changes.join(' · ')||(ev.action==='navigate'?'Navegação registrada.':'Sem alteração de recursos registrada.')));
        if(d.dropped)card.append(make('p','',d.dropped+' eventos antigos não foram enviados: limite da fila local.'));
        for(const log of d.logs||[])card.append(make('p','',log.message));
        $('activityEvents').append(card);
      }
      if(!data.events.length&&!more)$('activityEvents').append(make('p','muted','Nenhuma ação enviada ainda. O registro começa nesta atualização; ações offline chegam após a reconexão.'));
      $('activitySummary').textContent='Sinais nos '+data.events.length+' eventos desta página: '+failures+' falha(s), '+training+' tentativa(s) de treino, '+purchases+' tentativa(s) de compra/melhoria; descontos por falha: R$ '+amount(totalLoss)+'. São observações, não uma conclusão automática sobre a estratégia.';
      const pv=$('activityPvp');pv.replaceChildren(make('h3','','PvP · últimos 20 duelos'));
      for(const m of data.pvp){const card=make('div','history');card.append(make('strong','',(m.kind==='debate'?'Debate':'Perguntas')+' · '+(m.mode==='live'?'Ao vivo':'Por turnos')+' × '+(m.opponent||'Aguardando')),make('small','',date(m.created_at)+' · '+m.state));
        if(m.state==='finished'){card.append(make('p','','Placar: '+m.own_score+' × '+m.opponent_score));for(const r of m.rounds||[])card.append(make('p','','Rodada '+r.round+': '+(m.kind==='quiz'?(r.choice===null?'sem resposta':'alternativa '+(Number(r.choice)+1)):(r.choice||'sem jogada'))+' · '+r.points+' pontos'));}
        else card.append(make('p','muted','Estratégias indisponíveis enquanto o duelo não terminar.'));pv.append(card);}
      if(!data.pvp.length)pv.append(make('p','muted','Nenhum duelo registrado.'));
      activityCursor=data.next;$('activityMore').disabled=!activityCursor;$('activityPanel').hidden=false;
      if(!more)$('activityPanel').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){report('Não foi possível consultar a atividade: '+err.message,true);}
    finally{activityLoading=false;$('activityRefresh').disabled=false;if(gen!==activityGeneration)$('activityMore').disabled=true;}
  }
  $('activityBtn').addEventListener('click',()=>showActivity());
  $('activityRefresh').addEventListener('click',()=>showActivity());
  $('activityMore').addEventListener('click',()=>showActivity(true));
  $('closeActivity').addEventListener('click',()=>{$('activityPanel').hidden=true;activityGeneration++;});
  $('loginForm').addEventListener('submit',signIn);
  $('logout').addEventListener('click',signOut);
  $('refreshBtn').addEventListener('click',()=>loadDashboard());
  $('searchBtn').addEventListener('click',()=>{currentSearch=$('search').value.trim();loadDashboard(false);});
  $('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{
    currentSearch=$('search').value.trim();loadDashboard(false);
  },420);});
  $('editForm').addEventListener('submit',applyEdits);
  $('resetFields').addEventListener('click',fillFields);
  $('suspend').addEventListener('click',()=>moderate('suspend'));
  $('ban').addEventListener('click',()=>moderate('ban'));
  $('unban').addEventListener('click',()=>moderate('unban'));
  $('historyBtn').addEventListener('click',()=>showHistory(true));
  $('closeHistory').addEventListener('click',()=>$('historyPanel').hidden=true);
  try{session=JSON.parse(sessionStorage.getItem(AUTH_KEY)||'null');}catch(_){}
  if(session?.access_token && session?.refresh_token){
    loadDashboard().then(()=>{
      if(!$('notice').classList.contains('error'))showLoggedIn(true);
      else{session=null;saveSession();loginReport('Sessão administrativa inválida. Entre novamente.');}
    });
  }
})();


