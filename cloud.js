/* Mestre da Educação — contas e sincronização. Nenhuma chave secreta no frontend.
   Supabase Auth REST + PostgREST. A chave sb_publishable é pública por definição.
   Salva primeiro no aparelho; usa controle de revisão para evitar sobrescrever partidas em outro dispositivo.
*/
(() => {
  'use strict';
  const SUPABASE_URL = String(window.MESTRE_CONFIG?.supabaseUrl || '').replace(/\/$/, '');
  const PUBLISHABLE_KEY = String(window.MESTRE_CONFIG?.supabasePublishableKey || '');
  const EMAIL_RECOVERY_ENABLED = window.MESTRE_CONFIG?.emailRecoveryEnabled === true;
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) && /^(sb_publishable_|eyJ)/.test(PUBLISHABLE_KEY);
  const SESSION_KEY = 'mestre_educacao_auth_session_v1';
  const SAVE_PREFIX = 'mestre_educacao_conta_v1_';
  const STATUS = document.getElementById('storageStatus');
  const DETAILS = document.getElementById('cloudDetails');
  const OVERLAY = document.getElementById('authOverlay');
  const MESSAGE = document.getElementById('authMessage');
  const SUBMIT = document.getElementById('authSubmit');
  let session = null;
  let user = null;
  let ready = false;
  let record = null;
  let lastStateJSON = '';
  let saveTimer = 0;
  let saving = false;
  let syncBlocked = false;
  let lastPushAt = 0;
  let mode = 'login';
  let deferredInstall = null;
  let activating = false;
  let resetPassword = false;

  const $ = id => document.getElementById(id);
  function status(msg) { STATUS.textContent = msg; if (DETAILS) DETAILS.textContent = 'Status: ' + msg; }
  function message(msg, isError = false) { MESSAGE.textContent = msg; MESSAGE.classList.toggle('error', isError); }
  function localKey() { return user ? SAVE_PREFIX + user.id : ''; }
  function storeSession() { try { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); } catch (_) {} }
  function storeRecord() { try { if (record && user) { localStorage.setItem(localKey(), JSON.stringify(record)); return true; } return false; } catch (_) { return false; } }
  function readRecord() {
    try {
      const raw = JSON.parse(localStorage.getItem(localKey()) || 'null');
      if (!raw || typeof raw !== 'object') return null;
      const data = normalize(raw.state);
      if (!data) return null;
      return { state: data, revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
        dirty: Boolean(raw.dirty), changedAt: Number(raw.changedAt) || 0,
        adminRevision: Number.isSafeInteger(raw.adminRevision) && raw.adminRevision >= 0 ? raw.adminRevision : 0 };
    } catch (_) { return null; }
  }
  function loadLocalState() { return record?.state ? normalize(record.state) : null; }

  function parseError(data, statusCode) {
    const msg = data?.msg || data?.message || data?.error_description || data?.error || 'Erro de conexão';
    const e = new Error(String(msg)); e.status = statusCode; return e;
  }
  async function request(path, options = {}, authorized = false, retry = true) {
    const headers = { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json', ...options.headers };
    if (authorized) {
      if (!session?.access_token) throw new Error('Sessão inválida. Entre novamente.');
      if (Date.now() >= (session.expires_at || 0) - 60000 && navigator.onLine) await refreshSession();
      headers.Authorization = 'Bearer ' + session.access_token;
    }
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000);
    try {
      const response = await fetch(SUPABASE_URL + path, { ...options, headers, signal: ctrl.signal });
      const payload = await response.text();
      let data = null;
      try { data = payload ? JSON.parse(payload) : null; } catch (_) { data = payload; }
      if (!response.ok) {
        if (response.status === 401 && authorized && retry && session?.refresh_token) {
          await refreshSession();
          return request(path, options, authorized, false);
        }
        throw parseError(data, response.status);
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Conexão excedeu o tempo. O progresso local continua guardado.');
      throw err;
    } finally { clearTimeout(timeout); }
  }
  async function refreshSession() {
    if (!session?.refresh_token) throw new Error('Sessão expirada. Faça login novamente.');
    const refresh = session.refresh_token;
    // Sem recursão: a renovação usa o endpoint sem cabeçalho Bearer.
    const result = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refresh }) });
    if (!result?.access_token) throw new Error('Não foi possível renovar a sessão.');
    session = { ...session, ...result, user: result.user || session.user,
      expires_at: Date.now() + (Number(result.expires_in) || 3600) * 1000 };
    storeSession();
    return session;
  }
  function setSession(response) {
    if (!response?.access_token || !response?.user?.id) throw new Error('Confirme seu e-mail antes de entrar.');
    session = { access_token: response.access_token, refresh_token: response.refresh_token,
      expires_in: response.expires_in, expires_at: Date.now() + (Number(response.expires_in) || 3600) * 1000,
      user: response.user };
    storeSession();
  }
  async function requireActiveAccount() {
    const data = await request('/rest/v1/rpc/mestre_player_access',
      {method:'POST', body:'{}'}, true);
    if (!data || data.status !== 'active') {
      const duration = data?.status==='suspended' && data.suspended_until
        ? ' até ' + new Date(data.suspended_until).toLocaleString('pt-BR') : '';
      const label = data?.status==='suspended' ? 'Conta suspensa' : 'Conta banida';
      const e = new Error(label + duration + '. ' + (data?.reason || 'Entre em contato com a administração.'));
      e.accountBlocked = true;
      throw e;
    }
  }
  function lockAccount(msg) {
    // Uma suspensão não apaga saves locais, mas impede o uso online da conta.
    ready=false; user=null; record=null; session=null; syncBlocked=true;
    clearTimeout(saveTimer); storeSession();
    OVERLAY.hidden=false;
    $('accountMenu').hidden=true;
    $('installNotice').hidden=true;
    setMode('login');
    message(msg,true);
    status('Acesso suspenso pelo administrador.');
  }
  async function fetchCloud() {
    const id = encodeURIComponent(user.id);
    const rows = await request(`/rest/v1/mestre_educacao_saves?user_id=eq.${id}&select=game_state,revision,admin_revision,updated_at`, {method:'GET'}, true);
    if (!Array.isArray(rows)) throw new Error('Resposta inválida do banco de dados.');
    return rows[0] || null;
  }
  function takeCloud(cloud) {
    const data = normalize(cloud.game_state);
    if (!data) throw new Error('O save da nuvem está inválido. Seu progresso local não foi sobrescrito.');
    record = {state: data, revision: Number(cloud.revision) || 1,
      adminRevision: Number(cloud.admin_revision) || 0, dirty:false, changedAt: Date.now()};
    s = data;
    lastStateJSON = JSON.stringify(s);
    if (!storeRecord()) status('Atenção: não foi possível salvar cópia local.');
    render();
  }
  async function reconcile(isStartup) {
    if (!user || !navigator.onLine) { status('Sem internet: progresso salvo no aparelho (sincronização pendente).'); return; }
    const cloud = await fetchCloud();
    if (cloud) {
      const remoteRev = Number(cloud.revision) || 1;
      const remoteAdminRev = Number(cloud.admin_revision) || 0;
      if (remoteAdminRev > (record?.adminRevision || 0)) {
        // Edições administrativas têm prioridade sobre saves offline desatualizados.
        // Preservar cópia local anterior para diagnóstico, nunca enviá-la automaticamente.
        if (record?.dirty) {
          try { localStorage.setItem(localKey() + '_antes_admin_' + Date.now(), JSON.stringify(record)); } catch (_) {}
        }
        takeCloud(cloud);
        syncBlocked = false;
        status('A partida foi atualizada pelo administrador e carregada da nuvem.');
        return;
      }
      if (record?.dirty && record.revision !== remoteRev) {
        const useLocal = window.confirm('Há duas versões da partida: uma neste aparelho e outra na nuvem.\n\nOK = manter esta partida local e enviar à nuvem.\nCancelar = usar a partida da nuvem.\n\nExporte um backup antes de trocar de versão se tiver dúvidas.');
        if (useLocal) {
          record.revision = remoteRev;
          storeRecord();
          syncBlocked = false;
        } else { takeCloud(cloud); syncBlocked = false; }
      } else if (!record || !record.dirty) { takeCloud(cloud); syncBlocked = false; }
      // Se dirty e mesma revisão, mantemos as alterações locais e enviamos depois.
    } else {
      if (!record) record = {state: s, revision:0, adminRevision:0, dirty:true, changedAt:Date.now()};
      record.revision = 0;
      record.dirty = true;
      storeRecord();
      syncBlocked = false;
    }
    if (record?.dirty && !syncBlocked) schedulePush(50);
    else status('Progresso carregado e sincronizado na nuvem.');
  }
  function schedulePush(delay = 1500) {
    if (!ready || syncBlocked || !user || !record?.dirty || !navigator.onLine) return;
    clearTimeout(saveTimer);
    const minGap = Math.max(0, 15000 - (Date.now() - lastPushAt));
    saveTimer = setTimeout(() => pushCloud(), Math.max(delay,minGap));
  }
  async function pushCloud() {
    if (!ready || saving || syncBlocked || !record?.dirty || !user) return;
    if (!navigator.onLine) { status('Offline: progresso salvo no aparelho, aguardando internet.'); return; }
    saving = true;
    const stateSnapshot = JSON.stringify(record.state);
    const oldRev = record.revision;
    const nextRev = oldRev + 1;
    status('Salvando progresso na nuvem...');
    try {
      await requireActiveAccount();
      let updated;
      if (oldRev === 0) {
        updated = await request('/rest/v1/mestre_educacao_saves', {
          method:'POST', headers:{Prefer:'return=representation'},
          body:JSON.stringify({user_id:user.id, game_state:JSON.parse(stateSnapshot), revision:nextRev})
        }, true);
      } else {
        updated = await request(`/rest/v1/mestre_educacao_saves?user_id=eq.${encodeURIComponent(user.id)}&revision=eq.${oldRev}`, {
          method:'PATCH', headers:{Prefer:'return=representation'},
          body:JSON.stringify({game_state:JSON.parse(stateSnapshot),revision:nextRev,
            ack_admin_revision:record.adminRevision || 0,updated_at:new Date().toISOString()})
        }, true);
      }
      if (!Array.isArray(updated) || updated.length !== 1) {
        syncBlocked = true;
        status('Conflito entre aparelhos: save local preservado. Use “Sincronizar / resolver conflito”.');
        return;
      }
      record.revision = nextRev;
      record.dirty = JSON.stringify(record.state) !== stateSnapshot;
      storeRecord();
      lastPushAt = Date.now();
      if (record.dirty) schedulePush(1800); else status('Progresso salvo neste aparelho e na nuvem.');
    } catch (err) {
      if (err.status === 409) {
        syncBlocked = true;
        status('Conflito de progresso: save local preservado. Clique em “Sincronizar / resolver conflito”.');
      } else if (err.accountBlocked) lockAccount(err.message);
      else status('Save local preservado; não foi possível sincronizar: ' + err.message);
    } finally { saving = false; }
  }
  function saveLocal(state) {
    if (!ready || !user) return false;
    try {
      const json = JSON.stringify(state);
      if (json !== lastStateJSON) {
        if (!record) record={state:state,revision:0,adminRevision:0,dirty:true,changedAt:Date.now()};
        record.state=JSON.parse(json);
        record.dirty=true;
        record.changedAt=Date.now();
        lastStateJSON=json;
        if (!storeRecord()) return false;
        status(navigator.onLine ? 'Progresso salvo no aparelho; sincronização programada.' : 'Offline: progresso salvo no aparelho.');
        schedulePush();
      }
      return true;
    } catch (_) { status('Falha ao gravar no navegador. Exporte seu save.'); return false; }
  }
  async function activateSession(offlineAllowed=false) {
    if (activating) return;
    activating = true;
    ready = false;
    user = session.user;
    record = readRecord();
    s = record?.state || initial();
    lastStateJSON = JSON.stringify(s);
    render();
    status('Carregando a partida...');
    try {
      if (navigator.onLine) { await requireActiveAccount(); await reconcile(true); }
      else if (!record && !offlineAllowed) throw new Error('Primeiro login precisa de internet.');
      else if (!record) record={state:s,revision:0,adminRevision:0,dirty:true,changedAt:Date.now()};
    } catch (error) {
      if (error.accountBlocked) { lockAccount(error.message); activating=false; return; }
      if (!record && !offlineAllowed) { status('Não foi possível carregar a partida: ' + error.message); message(error.message,true); activating=false; return; }
      status('Sem nuvem no momento: jogando com save local. ' + error.message);
    }
    ready=true;
    OVERLAY.hidden=true;
    $('accountMenu').hidden=false;
    $('accountName').textContent = String(user.user_metadata?.display_name || user.email || 'Jogador').slice(0,60);
    claimLock();
    render();
    if (record?.dirty) schedulePush(200);
    maybeOfferInstall();
    activating=false;
  }
  function setMode(next) {
    mode=next;
    $('modeLogin').classList.toggle('active',next==='login');
    $('modeRegister').classList.toggle('active',next==='register');
    $('nameWrap').hidden=next!=='register';
    $('authName').required=next==='register';
    $('authPassword').autocomplete=next==='register'?'new-password':'current-password';
    SUBMIT.textContent=next==='register'?'Criar conta e iniciar':'Entrar no jogo';
    message('');
  }
  async function loginOrRegister(e) {
    e.preventDefault();
    if (!configured) return message('Configure o Supabase no arquivo config.js antes de criar ou acessar contas.',true);
    const email = $('authEmail').value.trim().toLowerCase();
    const password = $('authPassword').value;
    const name = $('authName').value.trim();
    if (mode==='register' && (name.length<2 || name.length>60)) return message('Informe um nome entre 2 e 60 caracteres.',true);
    SUBMIT.disabled=true;
    message('Conectando ao servidor de contas...');
    try {
      const path=mode==='register'
        ? '/auth/v1/signup?redirect_to='+encodeURIComponent(location.origin+location.pathname)
        : '/auth/v1/token?grant_type=password';
      const payload=mode==='register'?{email,password,data:{display_name:name}}:{email,password};
      const result=await request(path,{method:'POST',body:JSON.stringify(payload)});
      if (result?.access_token && result?.user) { setSession(result); await activateSession(); }
      else if (mode==='register' && result?.user) {
        setMode('login');
        message('O cadastro foi recebido, mas o Supabase ainda exige confirmação de e-mail. O administrador precisa desativar Confirm Email em Authentication > Sign In / Providers > Email antes de liberar o acesso imediato.',true);
      } else throw new Error('Não foi possível entrar. Confira os dados e as configurações do Supabase.');
    } catch (err) { message(err.message,true); }
    finally { SUBMIT.disabled=false; }
  }
  async function signOut() {
    if (record?.dirty && !confirm('Existem alterações locais pendentes de sincronização. Elas permanecem salvas neste aparelho. Deseja sair?')) return;
    saveLocal(s);
    const bearer = session?.access_token;
    session=null;
    storeSession();
    if (bearer && navigator.onLine) {
      // Logout remoto best effort: tokens locais são descartados imediatamente.
      fetch(SUPABASE_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:PUBLISHABLE_KEY,Authorization:'Bearer '+bearer}}).catch(()=>{});
    }
    user=null;record=null;ready=false;syncBlocked=false;
    clearTimeout(saveTimer);
    $('accountMenu').hidden=true;
    $('installNotice').hidden=true;
    OVERLAY.hidden=false;
    setMode('login');
    message('Sessão encerrada. Seu save nesta conta foi mantido no aparelho.');
    status('Faça login para abrir sua carreira.');
  }
  async function manualSync() {
    if (!ready || !user) return;
    if (!navigator.onLine) return status('Sem internet. Seu save local está preservado.');
    if (saving) return status('Sincronização em andamento...');
    status('Verificando versões na nuvem...');
    try { await requireActiveAccount(); syncBlocked=false; await reconcile(false); if (record?.dirty) await pushCloud(); }
    catch (err) { if(err.accountBlocked) lockAccount(err.message); else status('Não foi possível consultar a nuvem: '+err.message); }
  }
  async function forgotPassword() {
    if (!EMAIL_RECOVERY_ENABLED) return message('Recuperação de senha por e-mail ficará disponível depois da configuração do SMTP.',true);
    const email = $('authEmail').value.trim().toLowerCase();
    if (!email) return message('Digite seu e-mail acima para receber o link de recuperação.',true);
    if (!configured) return message('Configure o Supabase no arquivo config.js primeiro.',true);
    if (!navigator.onLine) return message('É necessária conexão para recuperar senha.',true);
    try {
      const redirect=encodeURIComponent(location.origin+location.pathname);
      await request('/auth/v1/recover?redirect_to='+redirect,{method:'POST',body:JSON.stringify({email})});
      message('Se o endereço estiver cadastrado, você receberá um e-mail para criar uma nova senha.');
    } catch(err) { message(err.message,true); }
  }
  async function boot() {
    $('forgotPassword').hidden = !EMAIL_RECOVERY_ENABLED;
    setMode('login');
    $('modeLogin').addEventListener('click',()=>setMode('login'));
    $('modeRegister').addEventListener('click',()=>setMode('register'));
    $('authForm').addEventListener('submit',loginOrRegister);
    $('logoutBtn').addEventListener('click',signOut);
    $('forgotPassword').addEventListener('click',forgotPassword);
    $('syncNow').addEventListener('click',manualSync);
    $('importOldInfo').addEventListener('click',()=>message('No HTML antigo, abra Configurações > Dados > Exportar save (.json). Aqui, depois do login, use Configurações > Dados > Importar save (.json).'));
    $('passwordForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const password=$('newPassword').value;
      if (password.length<6) return message('A senha precisa ter pelo menos 6 caracteres.',true);
      try {await request('/auth/v1/user',{method:'PUT',body:JSON.stringify({password})},true);resetPassword=false;$('passwordForm').hidden=true;$('authForm').hidden=false;await activateSession();}
      catch(err) {message(err.message,true);}
    });
    window.addEventListener('online',()=>{if(ready)manualSync();});
    window.addEventListener('offline',()=>{if(ready)status('Offline: progresso salvo neste aparelho até reconectar.');});
    window.addEventListener('pagehide',()=>{if(ready)saveLocal(s);});
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;if(ready)maybeOfferInstall();});
    window.addEventListener('appinstalled',()=>{$('installNotice').hidden=true;localStorage.setItem('mestre_educacao_installed','1');});
    $('installLater').addEventListener('click',()=>{localStorage.setItem('mestre_educacao_install_later','1');$('installNotice').hidden=true;});
    $('installBtn').addEventListener('click',async()=>{
      if (deferredInstall) {
        const prompt=deferredInstall;deferredInstall=null;prompt.prompt();
        try{await prompt.userChoice;}catch(_){ }
        $('installNotice').hidden=true;
      } else {
        const guide=$('installGuide');
        guide.textContent=/iPad|iPhone|iPod/i.test(navigator.userAgent)?'No Safari: Compartilhar → Adicionar à Tela de Início.':'No menu do navegador, escolha “Instalar app” ou “Adicionar à tela inicial”.';
      }
    });
    if (!configured) {message('CONFIGURAÇÃO PENDENTE: conecte um projeto Supabase exclusivo em config.js e execute supabase.sql.'); status('Configuração do Supabase pendente.'); return;}
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
    }
    // A confirmação de cadastro/recuperação do Supabase retorna tokens na fragment identifier.
    const hash = new URLSearchParams(location.hash.replace(/^#/,''));
    if (hash.has('access_token') && hash.has('refresh_token')) {
      try {
        const data={access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),
          expires_in:Number(hash.get('expires_in')) || 3600, user: await request('/auth/v1/user',{headers:{Authorization:'Bearer '+hash.get('access_token')}})};
        setSession(data);
        history.replaceState(null,'',location.pathname+location.search);
        if(hash.get('type')==='recovery'){
          resetPassword=true;$('authForm').hidden=true;$('passwordForm').hidden=false;message('Digite sua nova senha.');return;
        }
        await activateSession();return;
      } catch(err) {message('Link inválido ou expirado: '+err.message,true);}
    }
    try {const cached=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(cached?.access_token && cached?.user?.id) session=cached;}catch(_){ }
    if (session) {
      if (navigator.onLine) {
        try {if(Date.now() > session.expires_at-60000) await refreshSession();
          const account=await request('/auth/v1/user',{method:'GET'},true);
          if(account?.id) {session.user=account;storeSession();await activateSession();return;}}
        catch(err) { if(!localStorage.getItem(SAVE_PREFIX+session.user.id)) {session=null;storeSession();message('Faça login novamente: '+err.message,true);return;} }
      }
      if (localStorage.getItem(SAVE_PREFIX+session.user.id)) {await activateSession(true);return;}
    }
    message('Entre ou crie uma conta para começar.');
  }
  function maybeOfferInstall() {
    if (localStorage.getItem('mestre_educacao_install_later') || localStorage.getItem('mestre_educacao_installed')) return;
    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
    $('installNotice').hidden=false;
    $('installBtn').textContent=deferredInstall?'Instalar agora':'Como instalar';
    if (!deferredInstall) $('installGuide').textContent='No celular, use “Adicionar à tela inicial” no menu do navegador. Assim você pode abrir o jogo como aplicativo.';
  }
  window.GameCloud = { canPlay:()=>ready, loadLocalState, saveLocal, sync:manualSync };
  boot().catch(err=>{message('Não foi possível iniciar a autenticação: '+err.message,true);status('Falha de inicialização; seus saves locais não foram apagados.');});
})();
