/* Mestre da Educação: acesso administrativo independente da interface do jogo.
   A UI não concede privilégios: toda consulta e escrita passa pelas RPCs protegidas do Supabase.
*/
(() => {
  'use strict';
  const cfg = window.MESTRE_CONFIG || {};
  const BASE = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  const KEY = String(cfg.supabasePublishableKey || '');
  const AUTH_KEY = 'mestre_admin_session_tab_v1';
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
    $('loginForm').reset();loginReport('Sessão administrativa encerrada.');
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
  function clearSelection(){
    selected=null;$('selectedName').textContent='';$('selectedId').textContent='';
    $('lastSeen').textContent='';$('editForm').hidden=true;
    $('noSave').textContent='Escolha um jogador para consultar sua partida.';
    $('playerStatus').textContent='Selecione uma conta';
    for(const id of ['suspend','ban','unban']) $(id).disabled=true;
    $('moderationInfo').textContent='';
  }
  function pickPlayer(id) {
    const p=players.find(x=>x.user_id===id);
    if(!p)return;
    selected=p;
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
