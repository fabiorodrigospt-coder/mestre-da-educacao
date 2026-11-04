/* Server-authoritative PvP. No scores, answer keys or credentials are stored here. */
(() => {
  'use strict';
  const subjects={portugues:'Português',matematica:'Matemática',historia:'História',geografia:'Geografia',ciencias:'Ciências',ingles:'Inglês'};
  const attrs={didatica:'Didática',dominio:'Domínio',carisma:'Carisma',paciencia:'Paciência',argumentacao:'Argumentação',percepcao:'Percepção',criatividade:'Criatividade'};
  const strategies={argumentar:['Argumentar','12 foco · Pressiona quem prepara.'],contra:['Contra-argumentar','14 foco · Responde à argumentação; vulnerável ao improviso.'],preparar:['Preparar','Recupera 15 foco · +5 na próxima jogada; vulnerável à pressão.'],improvisar:['Improvisar','20 foco · Supera contra-argumentos; variação de −5 a +5.']};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=m=>`${m.kind==='quiz'?'Perguntas · '+(subjects[m.subject]||m.subject):'Debate estratégico'} · ${m.mode==='live'?'Ao vivo':'Por turnos'}`;
  const states={waiting:'Convite pendente',ready:'Sala de espera',active:'Em disputa',finished:'Concluída',cancelled:'Cancelada'};
  const dialog=document.createElement('dialog');
  dialog.id='pvpDialog';
  dialog.innerHTML='<header class="pvp-head"><div><small>MESTRE DA EDUCAÇÃO · ARENA ONLINE</small><h1>PvP entre jogadores</h1></div><button type="button" data-pvp="close" aria-label="Fechar PvP">✕</button></header><nav aria-label="PvP"><button data-pvp="lobby">Desafios</button><button data-pvp="build">Atributos</button><button data-pvp="ranking">Ranking</button><button data-pvp="help">Regras</button></nav><p id="pvpNotice" role="status" aria-live="polite"></p><div id="pvpBody"></div>';
  document.body.append(dialog);
  const body=dialog.querySelector('#pvpBody'),notice=dialog.querySelector('#pvpNotice');
  let user=null,lobby=null,match=null,view='',poll=null,offset=0,signature='',epoch=0,busy=false,polling=false;
  function tell(text,error=false){notice.textContent=text;notice.classList.toggle('pvp-error',error);}
  async function rpc(action,data={}){
    if(!navigator.onLine)throw Error('O PvP precisa de internet. Sua carreira individual continua disponível offline.');
    if(!window.GameCloud?.canPlay())throw Error('Entre no jogo para abrir o PvP.');
    return window.GameCloud.pvp(action,data);
  }
  function stop(){clearInterval(poll);poll=null;epoch++;}
  function switchView(next){stop();view=next;signature='';tell('');}
  function renderLobby(data){
    lobby=data;user=data.user_id;
    body.innerHTML=`<div class="pvp-intro"><h2>Desafie seus amigos</h2><p>Debates com estratégia ou cinco perguntas de uma matéria. Por turnos: 48 horas por rodada. Ao vivo: 45 segundos por rodada.</p></div>
      <div class="pvp-grid"><section class="pvp-card"><h2>Novo desafio</h2><form id="pvpCreate"><label>Tipo<select name="kind"><option value="debate">Debate estratégico</option><option value="quiz">Perguntas por matéria</option></select></label><label>Modalidade<select name="mode"><option value="async">Por turnos</option><option value="live">Ao vivo · sala com código</option></select></label><label>Adversário<select name="opponent"><option value="">Sala aberta com código · somente ao vivo</option>${data.players.map(p=>`<option value="${esc(p.user_id)}">${esc(p.display_name)}</option>`).join('')}</select></label><div id="pvpQuizFields" hidden><label>Matéria<select name="subject">${Object.entries(subjects).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Dificuldade<select name="difficulty"><option value="1">Básica</option><option value="2">Intermediária</option><option value="3">Avançada</option></select></label></div><button class="pvp-primary" type="submit">Criar desafio</button></form></section>
      <section class="pvp-card"><h2>Entrar em sala ao vivo</h2><p>Peça o código ao amigo que criou a sala. Os dois confirmam presença antes do início.</p><form id="pvpJoin"><label>Código da sala<input name="code" maxlength="10" minlength="10" required autocomplete="off" placeholder="Código de 10 caracteres"></label><button class="pvp-primary">Entrar na sala</button></form><button data-pvp="lobby" class="pvp-refresh">Atualizar convites</button></section></div>
      <section class="pvp-card"><h2>Meus desafios e histórico</h2>${data.matches.length?data.matches.map(m=>`<article class="pvp-match"><div><strong>${esc(m.opponent||'Aguardando adversário')}</strong><p>${esc(label(m))}</p><small>${states[m.state]}${m.state==='active'?' · Rodada '+m.round+'/5':''}${m.state==='finished'?' · '+(m.winner===user?'Vitória':m.winner?'Derrota':'Empate'):''}</small></div><button data-pvp="open" data-id="${esc(m.id)}">${m.state==='finished'?'Ver resultado':'Abrir'}</button></article>`).join(''):'<p>Nenhum desafio ainda. Crie o primeiro ou peça um convite.</p>'}</section>`;
  }
  async function showLobby(){switchView('lobby');const e=epoch;const data=await rpc('lobby');if(e!==epoch||!dialog.open)return;renderLobby(data);}
  async function showBuild(){switchView('build');const e=epoch;const data=await rpc('lobby');if(e!==epoch)return;user=data.user_id;lobby=data;
    body.innerHTML=`<section class="pvp-card"><h2>Seu estilo de debate</h2><p>Distribua exatamente <strong>70 pontos</strong>, de 4 a 18 por atributo. Todos têm o mesmo orçamento. Dinheiro, equipamentos e saves offline não aumentam seu poder no PvP. Sua distribuição é fixada quando o duelo começa.</p><form id="pvpBuild"><div class="pvp-attributes">${Object.entries(attrs).map(([k,v])=>`<label>${v}<input type="number" name="${k}" min="4" max="18" step="1" value="${Number(data.build[k])}" required></label>`).join('')}</div><p id="pvpBuildTotal" role="status">70 / 70 pontos</p><button class="pvp-primary">Salvar especialização</button></form><details><summary>Como os atributos ajudam?</summary><p>Argumentar usa Argumentação, Domínio e Didática. Contra-argumentar usa Percepção, Paciência e Argumentação. Preparar usa Percepção, Paciência e Didática. Improvisar usa Criatividade, Carisma e Domínio.</p><p>Esses atributos afetam os debates. No modo de perguntas, apenas as respostas corretas pontuam.</p></details></section>`;
  }
  async function showRanking(filters={kind:'all',mode:'all'}){switchView('ranking');const e=epoch;const data=await rpc('ranking',filters);if(e!==epoch)return;
    const row=p=>`<tr class="${p.user_id===user?'pvp-me':''}"><td>${p.position}</td><th scope="row">${esc(p.display_name)}${p.user_id===user?' · você':''}</th><td>${p.points}</td><td>${p.wins}</td><td>${p.losses}</td><td>${p.draws}</td><td>${p.played?Math.round(p.wins/p.played*100):0}%</td></tr>`;
    body.innerHTML=`<section class="pvp-card"><h2>Ranking dos jogadores</h2><p>Vitória: 30 pontos · empate: 10 · derrota: 0. As primeiras três partidas válidas entre a mesma dupla, por tipo e modalidade a cada dia UTC, contam para o ranking.</p><form id="pvpRankFilters" class="pvp-filter"><label>Disputa<select name="kind"><option value="all">Todas</option><option value="debate">Debates</option><option value="quiz">Perguntas</option></select></label><label>Modalidade<select name="mode"><option value="all">Todas</option><option value="async">Por turnos</option><option value="live">Ao vivo</option></select></label><button>Filtrar</button></form><p>${data.me?`Sua posição: <strong>${data.me.position}º</strong> · ${data.me.points} pontos`:'Sua conta ainda não aparece na classificação.'}</p><div class="pvp-table"><table><thead><tr><th>#</th><th>Jogador</th><th>Pontos</th><th>V</th><th>D</th><th>E</th><th>Vitórias</th></tr></thead><tbody>${data.top.map(row).join('')}</tbody></table></div><small>Visível a todos os jogadores conectados. E-mails não são exibidos. Contas bloqueadas ficam fora da classificação.</small></section>`;
    const f=body.querySelector('#pvpRankFilters');f.elements.kind.value=filters.kind;f.elements.mode.value=filters.mode;
  }
  function renderMatch(m,force=false){
    match=m;if(['finished','cancelled'].includes(m.state)){clearInterval(poll);poll=null;}offset=Date.parse(m.server_time)-Date.now();
    const next=JSON.stringify({...m,server_time:null});if(signature===next&&!force)return;signature=next;
    const mine=m.p1===user,focus=mine?m.focus1:m.focus2;
    let content='';
    if(m.state==='waiting')content=`<p>${mine?'Convite criado. Aguarde seu adversário.':'Você recebeu um desafio.'}</p>${m.mode==='live'?`<p>Código: <strong class="pvp-code">${esc(m.code)}</strong></p><button data-pvp="copy">Copiar código</button>`:!mine?'<button data-pvp="accept" class="pvp-primary">Aceitar desafio</button>':''}<button data-pvp="cancel">${mine?'Cancelar convite':'Recusar convite'}</button>`;
    if(m.state==='ready')content=`<p>Confirme quando estiver pronto. A primeira rodada começa assim que ambos confirmarem.</p><p>${esc(m.name1)}: ${m.ready1?'pronto':'aguardando'} · ${esc(m.name2)}: ${m.ready2?'pronto':'aguardando'}</p><button data-pvp="ready" class="pvp-primary" ${(mine?m.ready1:m.ready2)?'disabled':''}>Estou pronto</button><button data-pvp="cancel">Sair da sala</button>`;
    if(m.state==='active'){
      content=`<p>Rodada <strong>${m.round} / 5</strong> · <span id="pvpClock"></span></p>${m.kind==='debate'?`<p>Seu foco: <strong>${focus} / 100</strong></p>`:'<p>Acertos e gabarito serão revelados ao encerrar a partida.</p>'}`;
      if(m.my_choice!==null)content+=`<div class="pvp-wait" role="status">Sua escolha está confirmada: ${m.kind==='quiz'?'alternativa '+(Number(m.my_choice)+1):esc(strategies[m.my_choice]?.[0]||m.my_choice)}. ${m.opponent_ready?'Processando rodada...':'Aguardando o adversário. Você pode fechar e voltar depois.'}</div>`;
      else if(m.kind==='quiz')content+=`<h3>${esc(m.question?.prompt||'Carregando pergunta...')}</h3><div class="pvp-options">${(m.question?.options||[]).map((o,i)=>`<button data-pvp="move" data-choice="${i}"><span>${i+1}</span>${esc(o)}</button>`).join('')}</div>`;
      else content+=`<div class="pvp-options">${Object.entries(strategies).map(([k,[n,d]])=>`<button data-pvp="move" data-choice="${k}" ${focus<({argumentar:12,contra:14,improvisar:20,preparar:0}[k])?'disabled':''}><strong>${n}</strong><small>${d}</small></button>`).join('')}</div>`;
      content+='<button data-pvp="resign" class="pvp-danger">Desistir do duelo</button>';
    }
    if(m.state==='finished')content=`<h2>${m.winner===user?'Você venceu!':m.winner?'Vitória do adversário':'Empate'}</h2><p>${esc(m.reason)} · ${m.ranked?'Resultado registrado no ranking.':'Sem pontos de ranking: limite da dupla atingido ou participação insuficiente.'}</p><p>${m.kind==='quiz'?'Acertos: '+m.score1/100+' × '+m.score2/100:'Pontuação: '+m.score1+' × '+m.score2}</p>`;
    if(m.state==='cancelled')content=`<p>${esc(m.reason||'Partida cancelada.')}</p>`;
    const history=m.history.length?`<section class="pvp-card"><h2>Rodadas ${m.state==='finished'?'e revisão':''}</h2>${m.history.map(r=>`<article class="pvp-round"><strong>Rodada ${r.round}</strong>${m.kind==='debate'?`<p>${esc(m.name1)}: ${esc(strategies[r.move1]?.[0]||'Sem jogada')} (${r.points1}) · ${esc(m.name2)}: ${esc(strategies[r.move2]?.[0]||'Sem jogada')} (${r.points2})</p>`:r.question?`<p>${esc(r.question.prompt)}</p><p>Resposta: <strong>${esc(r.question.options[r.question.answer])}</strong></p><p>${esc(r.question.explanation)}</p><small>${esc(m.name1)}: ${r.move1===null?'sem resposta':Number(r.move1)+1} (${r.points1/100}) · ${esc(m.name2)}: ${r.move2===null?'sem resposta':Number(r.move2)+1} (${r.points2/100})</small>`:'<p>Respostas guardadas. Correção disponível no fim do duelo.</p>'}</article>`).join('')}</section>`:'';
    body.innerHTML=`<button data-pvp="lobby">← Meus desafios</button><section class="pvp-card"><small>${esc(label(m))} · ${states[m.state]}</small><h2>${esc(m.name1||'Jogador')} × ${esc(m.name2||'Aguardando')}</h2>${content}</section>${history}`;
    updateClock();
  }
  async function openMatch(id){switchView('match');const e=epoch;const m=await rpc('get',{id});if(e!==epoch)return;renderMatch(m,true);if(['finished','cancelled'].includes(m.state))return;
    poll=setInterval(async()=>{if(polling||busy||document.hidden||!dialog.open)return;if(!window.GameCloud?.canPlay()){dialog.close();return;}polling=true;try{const n=await rpc('get',{id});if(e===epoch&&view==='match')renderMatch(n);}catch(err){if(e===epoch)tell(err.message,true);}finally{polling=false;}},m.mode==='live'?2500:10000);
  }
  function updateClock(){const el=body.querySelector('#pvpClock');if(!el||!match?.deadline)return;const seconds=Math.max(0,Math.ceil((Date.parse(match.deadline)-Date.now()-offset)/1000));el.textContent=seconds?`Prazo: ${seconds>=3600?Math.floor(seconds/3600)+'h ':''}${Math.floor(seconds%3600/60)}min ${seconds%60}s`:'Prazo encerrado; aguardando verificação do servidor.';}
  setInterval(()=>{if(dialog.open)updateClock();},1000);
  function help(){switchView('help');body.innerHTML=`<section class="pvp-card"><h2>Como disputar</h2><p><strong>Debate:</strong> cinco rodadas simultâneas e secretas. Cada estratégia combina três atributos. Contra-argumentar pune Argumentar; Argumentar pune Preparar; Preparar supera Contra-argumentar; Improvisar quebra o contra-argumento. Preparar também recupera foco e dá +5 na rodada seguinte.</p><p><strong>Perguntas:</strong> os dois recebem as mesmas cinco questões em ordem sorteada. Acerto vale 100; erro ou ausência vale zero. Atributos e foco não interferem. Empates são mantidos, sem desempate por velocidade. O gabarito aparece somente ao encerrar a partida.</p><p><strong>Ao vivo:</strong> ambos confirmam presença. Cada rodada dura 45 segundos, medidos pelo servidor. Ao esgotar, quem não respondeu recebe zero; o duelo avança quando um jogador consulta a sala.</p><p><strong>Por turnos:</strong> o convite dura sete dias. Depois de aceito, há 48 horas por rodada. Se só um respondeu dentro do prazo, vence por ausência; se nenhum respondeu, o duelo é cancelado.</p><p><strong>Ranking:</strong> 30 pontos por vitória, 10 por empate. Até três resultados diários por dupla, tipo e modalidade. Ambos precisam ter enviado pelo menos uma jogada. Fechar a janela não é desistir. Não há aposta nem transferência de dinheiro.</p><p>O PvP depende de internet. Ao voltar, use “Meus desafios”. As escolhas confirmadas não podem ser trocadas. O tempo exibido no aparelho é indicativo; o servidor decide os prazos.</p></section>`;}
  async function action(name,button){
    if(name==='close'){dialog.close();return;}
    if(name==='lobby')return showLobby();if(name==='build')return showBuild();if(name==='ranking')return showRanking();if(name==='help'){help();return;}
    if(name==='open')return openMatch(button.dataset.id);
    if(name==='copy'){await navigator.clipboard.writeText(match.code);tell('Código copiado. Envie para seu amigo.');return;}
    if(['accept','ready','cancel','resign','move'].includes(name)){
      if(name==='resign'&&!confirm('Desistir desta partida?'))return;
      const e=epoch;const data={id:match.id};if(name==='move'){data.round=match.round;data.choice=button.dataset.choice;}
      const m=await rpc(name,data);if(e===epoch)renderMatch(m,true);
    }
  }
  dialog.addEventListener('click',async e=>{const button=e.target.closest('[data-pvp]');if(!button||busy)return;busy=true;button.disabled=true;try{await action(button.dataset.pvp,button);}catch(err){tell(err.message,true);}finally{busy=false;if(button.isConnected)button.disabled=false;}});
  dialog.addEventListener('change',e=>{if(e.target.name==='kind')body.querySelector('#pvpQuizFields').hidden=e.target.value!=='quiz';});
  dialog.addEventListener('input',e=>{if(e.target.closest('#pvpBuild')){const total=Object.keys(attrs).reduce((n,k)=>n+Number(body.querySelector('#pvpBuild').elements.namedItem(k).value),0);body.querySelector('#pvpBuildTotal').textContent=total+' / 70 pontos';}});
  dialog.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;const f=e.target;const submit=f.querySelector('button');submit.disabled=true;
    try{if(f.id==='pvpCreate'){const d=Object.fromEntries(new FormData(f));d.difficulty=Number(d.difficulty);const m=await rpc('create',d);await openMatch(m.id);}
    else if(f.id==='pvpJoin'){const m=await rpc('join',{code:f.elements.code.value.trim()});await openMatch(m.id);}
    else if(f.id==='pvpBuild'){const a=Object.fromEntries(Object.keys(attrs).map(k=>[k,Number(f.elements.namedItem(k).value)]));await rpc('build',{attrs:a});tell('Especialização salva. Será usada nos próximos duelos.');}
    else if(f.id==='pvpRankFilters')await showRanking(Object.fromEntries(new FormData(f)));
    }catch(err){tell(err.message,true);}finally{busy=false;if(submit.isConnected)submit.disabled=false;}
  });
  dialog.addEventListener('close',()=>{stop();view='';});
  window.GamePvp={open:async()=>{if(!window.GameCloud?.canPlay())return;if(!dialog.open)dialog.showModal();try{await showLobby();}catch(err){tell(err.message,true);body.innerHTML='<p>Entre na internet e tente novamente.</p><button data-pvp="lobby">Tentar novamente</button>';}}};
})();
