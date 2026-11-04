/* Support-only gameplay activity; never reads form text, passwords or PvP choices. */
(() => {
 'use strict';
 const names={crime:'Tentativa de aula',heist:'Projeto em equipe',recruit:'Contratação',item:'Compra de material',train:'Treino',business:'Abrir unidade',upgrade:'Melhorar unidade',refill:'Recuperar energia',job:'Plantão',equip:'Equipar material',claim:'Resgatar missão',profession:'Especialização','buy-consumable':'Comprar consumível','use-consumable':'Usar consumível','duel-start':'Debate simulado','duel-action':'Jogada em debate simulado','duel-surrender':'Desistir do debate','deposit-all':'Depósito','deposit-half':'Depósito','withdraw-all':'Saque','withdraw-half':'Saque'};
 function snapshot(){return {money:s.money,bank:s.bank,energy:s.energy,heat:s.heat,respect:s.respect,xp:s.xp,attributes:{...s.attributes},wins:s.stats.wins,losses:s.stats.losses,prisonUntil:s.prisonUntil};}
 document.addEventListener('click',e=>{
  if(!window.GameCloud?.canPlay())return;
  const b=e.target.closest('[data-action],[data-tab]');if(!b||b.disabled||b.closest('#pvpDialog'))return;
  const a=b.dataset.action||'navigate';if(['mission-filter','mission-hide','mission-lock'].includes(a))return;
  const before=snapshot(),last=s.log[0],target=b.dataset.id||b.dataset.tab||'';
  const label=(names[a]||b.textContent||a).replace(/\s+/g,' ').trim().slice(0,180);
  queueMicrotask(()=>{
   const after=snapshot();const changed=JSON.stringify(before)!==JSON.stringify(after);
   const logs=s.log[0]!==last?s.log.slice(0,4).filter(x=>x.at>=Date.now()-1500).map(x=>({message:x.msg,type:x.type})):[];
   window.GameCloud.trackActivity({action:a,target,label,details:{before,after,changed,logs,tab:typeof tab==='string'?tab:'',offline:!navigator.onLine}});
  });
 },true);
})();
