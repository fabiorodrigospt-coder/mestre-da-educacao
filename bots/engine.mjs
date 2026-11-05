import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('function initial()'));
if(!source)throw Error('Motor do jogo não encontrado');
// Executes the shipped career rules, replacing presentation and browser persistence only.
export function createEngine(state=null,{now=Date.now,random=Math.random}={}){
 const element={style:{setProperty(){}},classList:{toggle(){},add(){},remove(){}},dataset:{},addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null};
 const storage={getItem:()=>null,setItem(){},removeItem(){}};
 const clock=class extends Date {constructor(...a){super(...(a.length?a:[now()]));}static now(){return now();}};
 const math=Object.create(Math);math.random=random;
 const sandbox={console,Date:clock,Math:math,JSON,Set,Map,URL,Blob,localStorage:storage,sessionStorage:storage,
  document:{hidden:false,documentElement:element,body:element,getElementById:()=>element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},
  window:{addEventListener(){},GameCloud:{canPlay:()=>true,saveLocal:()=>true}},navigator:{onLine:true},
  setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},confirm:()=>false};
 vm.createContext(sandbox);
 vm.runInContext(source+`\nfunction render(){} function renderHud(){} function applyPrefs(){} function initSettingsUI(){} function claimLock(){} function toast(){} function save(){} function commit(){}\n`,sandbox,{timeout:5000});
 if(state){sandbox.input=structuredClone(state);vm.runInContext('s=normalize(input);if(!s)throw Error("Save inválido");',sandbox);delete sandbox.input;}
 const run=code=>vm.runInContext(code,sandbox,{timeout:3000});
 return {state:()=>JSON.parse(run('JSON.stringify(s)')),metrics:()=>JSON.parse(run('JSON.stringify({xp:s.xp,level:xpLevel(),rank:level(),money:s.money,bank:s.bank,respect:s.respect,energy:s.energy,heat:s.heat,wins:s.stats.wins,losses:s.stats.losses,attributes:s.attributes,active_ms:s.economy.activeMs})')),
  tick:()=>run('updateTimers()'),step:(intelligence)=>{sandbox.cognition=intelligence;return run(`(()=>{
   updateTimers();if(!s.subject)pickSubject('matematica');if(imprisoned())return 'descanso';
   if(s.bosses.battle){tab='bosses';bossTurn(s.bosses.battle.charge>=2?'special':'attack');return 'turno_chefe';}
   if(s.arena.battle){tab='arena';fightTurn(s.arena.battle.charge>=2?'special':'attack');return 'turno_arena';}tab='crimes';
   if((!s.daily.lastDate||s.daily.lastDate<realDate())&&consumptionCount()<50){claimDaily();return 'recompensa_diaria';}
   const skill=SKILLS.find(k=>skillRank(k.id)<3&&skillAvailable()>=skillCost(skillRank(k.id),k.id)&&skillPrerequisite(k,skillRank(k.id)));
   if(skill&&Math.random()<.3){buySkill(skill.id);return 'habilidade';}
   const achievement=ACHIEVEMENTS.find(a=>!s.daily.achievements.includes(a.id)&&achievementValue(a)>=a.target);
   if(achievement){claimAchievement(achievement.id);return 'conquista';}
   if(s.energy<40){const coffee=CONSUMABLES.find(c=>s.consumables[c.id]>0);if(coffee&&!recoveryBlocked()){useConsumable(coffee.id);return 'cafe';}}
   const item=ITEMS.find(i=>i.price>0&&!s.inventory.includes(i.id)&&s.money>=itemPrice(i)*3);
   if(item&&Math.random()<.2){buyItem(item.id);return 'equipamento';}
   const district=DISTRICTS.find(d=>!ownedTerritory(d.id)&&level()>=d.lvl&&s.members.length>=d.need&&s.money>=d.cost&&s.energy>=d.energy);
   if(district&&Math.random()<.15){takeDistrict(district.id);return 'escola';}
   const boss=BOSSES.find(b=>!s.bosses.defeated.includes(b.id)&&xpLevel()>=b.need&&s.energy>=b.energy&&Date.now()-(s.bosses.lastFight[b.id]||0)>=90000);
   if(boss&&Math.random()<.08){tab='bosses';bossStart(boss.id);return 'chefe';}
   const rival=ARENA_BOTS.find(b=>level()>=b.lvl&&s.energy>=b.energy&&Date.now()-(s.arena.foughtAt[b.id]||0)>=ARENA_COOLDOWN_MS);
   if(rival&&Math.random()<.08){tab='arena';startDuel(rival.id);return 'arena';}
   const good=GOODS.find(g=>(s.commerce.goods[g.id]||0)>0);
   if(good&&Math.random()<.1){sellGood(good.id);return 'venda';}
   if(Math.random()<.03){const g=GOODS.find(g=>s.money>=goodsBuy(g)*4&&(s.commerce.goods[g.id]||0)<2);if(g){buyGood(g.id);return 'compra';}}
   if(s.commerce.auction&&!s.commerce.auction.settled&&Math.random()<.03){bidAuction(0);return 'leilao';}
   if(readyMissions().length){claimAllMissions();return 'missoes';}
   const eligible=CRIMES.filter(c=>!missing(c).length&&s.energy>=crimeEnergy(c));
   if(eligible.length&&Math.random()<.7){const c=Math.random()<cognition?eligible.reduce((a,b)=>(b.rep[0]*odds(b)/crimeEnergy(b)>a.rep[0]*odds(a)/crimeEnergy(a)?b:a)):eligible[Math.floor(Math.random()*eligible.length)];doCrime(c.id);return 'aula_'+c.id;}
   const business=BUSINESSES.find(b=>level()>=b.lvl&&(s.properties[b.id]?.count||0)<2&&s.money>=propertyPrice(b,s.properties[b.id]?.count||0));
   if(business&&Math.random()<cognition){buyBusiness(business.id);return 'negocio';}
   const member=MEMBERS.find(m=>!s.members.includes(m.id)&&s.money>=m.price*2);
   if(member&&Math.random()<.15){recruit(member.id);return 'colega';}
   if(s.members.length){const h=HEISTS.find(h=>s.members.length>=h.members&&level()>=h.level&&s.energy>=h.energy);if(h&&Math.random()<.15){doHeist(h.id);return 'projeto';}}
   if(!s.profession&&level()>=3){selectProfession('planner');return 'profissao';}
   const attr=Object.keys(attrNames).sort((a,b)=>s.attributes[a]-s.attributes[b])[0];
   if(s.money>Math.round(115+s.attributes[attr]*17)*2&&Math.random()<.35){train(attr);return 'treino';}
   if(Date.now()-s.lastJobAt>=25000){job();return 'plantao';}return 'aguardar';
  })()`);}};
}
export function debateChoice(focus,intelligence,opponentLast,random=Math.random){
 if(focus<20)return 'preparar';
 if(random()<intelligence&&opponentLast)return ({argumentar:'contra',contra:'improvisar',preparar:'argumentar',improvisar:'argumentar'})[opponentLast]||'argumentar';
 return ['argumentar','contra','preparar','improvisar'][Math.floor(random()*4)];
}
