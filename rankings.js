/* Public career summaries + server-validated PvP; never exposes a raw save. */
(() => {
 'use strict';
 const categories={geral:['Geral','pontos'],aulas:['Aulas concluídas','aulas'],pvp:['PvP online','pontos PvP'],perguntas:['Perguntas online','vitórias'],debates:['Debates contra personagens','vitórias'],desafios:['Grandes desafios','chefes diferentes'],projetos:['Projetos em equipe','vitórias'],patrimonio:['Patrimônio','R$'],reputacao:['Reputação','pontos'],experiencia:['Experiência','XP'],negocios:['Negócios','unidades'],escolas:['Escolas','escolas'],equipe:['Equipe','colegas'],missoes:['Missões','concluídas'],conquistas:['Conquistas','conquistas'],habilidades:['Habilidades','níveis adquiridos'],atributos:['Atributos','pontos'],comercio:['Comércio','R$ de lucro'],premios:['Prêmios diários','resgates'],operacoes:['Operações dos colegas','concluídas'],leiloes:['Leilões','vitórias']};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=x=>Number.isFinite(Number(x))?Number(x).toLocaleString('pt-BR',{maximumFractionDigits:0}):'0';
 const client=()=>window.GameRankingClient||window.GameCloud;
 const dialog=document.createElement('dialog');dialog.className='rank-dialog';dialog.id='rankingDialog';dialog.setAttribute('aria-labelledby','rankingTitle');
 dialog.innerHTML='<header class="rank-head"><div><small>MESTRE DA EDUCAÇÃO</small><h1 id="rankingTitle">Ranking dos jogadores</h1></div><button type="button" id="rankClose" aria-label="Fechar ranking">✕</button></header><p id="rankNotice" role="status" aria-live="polite"></p><div id="rankBody"></div>';
 document.body.append(dialog);const body=dialog.querySelector('#rankBody'),notice=dialog.querySelector('#rankNotice');
 let generation=0,category='geral',cohort='all',offset=0,busy=false;
 function tell(s){notice.textContent=s;}
 function render(r){
  const [title,unit]=categories[r.category];
  const row=p=>`<li class="rank-player ${p.user_id===r.user_id?'rank-me':''}"><div class="rank-place">${fmt(p.position)}º</div><div class="rank-person"><strong>${esc(p.display_name)}</strong>${p.is_simulated?'<span class="rank-tag">Simulado</span>':''}${p.user_id===r.user_id?'<span class="rank-tag">Você</span>':''}<small>${fmt(p.metrics.aulas)} aulas · ${fmt(p.metrics.desafios)} chefes · ${fmt(p.metrics.pvp)} pontos PvP</small></div><div class="rank-score"><strong>${fmt(p.score)}</strong><small>${esc(unit)}</small></div><details class="rank-detail"><summary>Ver pontuação e progresso</summary><div class="rank-breakdown">${Object.entries(categories).filter(([k])=>k!=='geral').map(([k,[label,u]])=>`<div><span>${esc(label)}</span><b>${fmt(p.metrics[k])} ${esc(u)}</b>${p.breakdown[k]!==undefined?`<small>+${fmt(p.breakdown[k])} pontos gerais</small>`:'<small>Já incluído no componente PvP</small>'}</div>`).join('')}</div><p><b>Total geral: ${fmt(p.metrics.geral)} pontos.</b></p><small>Save sincronizado em ${esc(new Date(p.synced_at).toLocaleString('pt-BR'))}.</small></details></li>`;
  body.innerHTML=`<form id="rankFilters" class="rank-filters"><label>Classificação<select name="category">${Object.entries(categories).map(([k,[v]])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label><label>Participantes<select name="cohort"><option value="all">Todos</option><option value="players">Jogadores reais</option><option value="simulated">Personagens simulados</option></select></label><button type="submit">Atualizar ranking</button></form>
  <section class="rank-summary"><h2>${esc(title)}</h2><p>${fmt(r.total)} participantes · ${r.me?`Sua posição: <b>${fmt(r.me.position)}º</b> · ${fmt(r.me.score)} ${esc(unit)}`:'Sua conta não participa deste filtro ou ainda não tem save sincronizado.'}</p><small>Atualizado em ${esc(new Date(r.generated_at).toLocaleString('pt-BR'))}. Para incluir seu progresso recente, use Sincronizar no jogo.</small></section>
  <details class="rank-rules"><summary>Como funciona a pontuação geral?</summary><p>A soma considera aulas, XP, reputação, debates, PvP, desafios, projetos, missões, conquistas, escolas, negócios, equipe, atributos, habilidades, patrimônio, comércio e prêmios. Dinheiro, XP e contagens repetíveis usam raiz quadrada para reduzir sua dominância. Em Perguntas, as vitórias já entram no PvP e não pontuam duas vezes.</p><p>Abra a ficha de qualquer participante para conferir cada parcela. Empates na pontuação compartilham a posição. Não há bônus por aparecer online ou por clicar mais vezes.</p><p>${esc(r.notice)}</p></details>
  <ol class="rank-list" aria-label="Classificação ${esc(title)}">${r.top.map(row).join('')||'<li class="rank-empty">Nenhum participante nesta classificação.</li>'}</ol>
  <footer class="rank-pages"><button type="button" id="rankPrevious" ${r.offset===0?'disabled':''}>Anterior</button><span>${r.total?fmt(r.offset+1):'0'}–${fmt(Math.min(r.total,r.offset+r.top.length))} de ${fmt(r.total)}</span><button type="button" id="rankNext" ${r.offset+r.top.length>=r.total?'disabled':''}>Próxima</button></footer>`;
  const form=body.querySelector('#rankFilters');form.elements.category.value=r.category;form.elements.cohort.value=r.cohort;
  form.addEventListener('submit',e=>{e.preventDefault();category=form.elements.category.value;cohort=form.elements.cohort.value;offset=0;void load();});
  body.querySelector('#rankPrevious').onclick=()=>{offset=Math.max(0,offset-20);void load();};body.querySelector('#rankNext').onclick=()=>{offset+=20;void load();};
 }
 async function load(){
  const epoch=++generation;busy=true;tell('Consultando o ranking no servidor…');for(const b of body.querySelectorAll('button,select'))b.disabled=true;
  try{if(!navigator.onLine)throw Error('O ranking precisa de internet. Seu progresso offline aparecerá depois de sincronizar.');if(!client()?.canPlay())throw Error('Entre no jogo para ver o ranking.');
   const data=await client().rankings({p_category:category,p_cohort:cohort,p_offset:offset,p_limit:20});if(epoch!==generation||!dialog.open)return;render(data);tell('');
  }catch(e){if(epoch===generation){tell(e.message||'Não foi possível consultar o ranking.');body.innerHTML='<p>O ranking não foi atualizado. Seu progresso foi preservado.</p><button type="button" id="rankRetry">Tentar novamente</button>';body.querySelector('#rankRetry').onclick=()=>void load();}}
  finally{if(epoch===generation)busy=false;}
 }
 dialog.querySelector('#rankClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{generation++;busy=false;});
 window.GameRanking={open:(next='geral')=>{if(!client()?.canPlay())return;category=categories[next]?next:'geral';offset=0;if(!dialog.open)dialog.showModal();void load();}};
})();
