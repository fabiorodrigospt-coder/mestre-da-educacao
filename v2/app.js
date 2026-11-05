/* Mestre da Educação 2.0 — escola isométrica (alpha)
   Motor de regras e persistência: jogo clássico, same-origin, sem nova economia.
   A interface NUNCA escreve XP/dinheiro diretamente.
*/
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const canvas=$('scene'), iframe=$('legacy'), dialog=$('dialog'), toastEl=$('toast');
const STATE={connected:false,game:null,state:null,locked:false,busy:false,active:null,target:null,mode:'explore',time:0,noticeAt:0};
const KEYBOARD=new Set();
const joystick={x:0,z:0,pointer:null};
let toastTimer=null,confirmAction=null,elapsed=0,centerCam=true;

function toast(msg,error=false){
 toastEl.textContent=msg;toastEl.className='show'+(error?' error':'');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toastEl.className='';},4200);
}
function ask(title,body,button,callback){
 $('dialogTitle').textContent=title;$('dialogBody').textContent=body;
 $('dialogConfirm').textContent=button;confirmAction=callback;dialog.classList.add('show');
}
function closeDialog(){dialog.classList.remove('show');confirmAction=null;}
$('dialogCancel').onclick=closeDialog;
$('dialogConfirm').onclick=()=>{const action=confirmAction;closeDialog();if(action)action();};

let renderer;
try{
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.setClearColor(0x091a29);
}catch(err){
 $('sceneState').textContent='WebGL indisponível';
 $('activityFeed').textContent='Este aparelho não conseguiu iniciar o cenário 3D. Use o jogo clássico.';
 $('classicBtn').onclick=()=>openClassic();
 $('loginHelp').classList.add('show');
 throw err;
}
const scene=new THREE.Scene();scene.background=new THREE.Color(0x102a3c);scene.fog=new THREE.Fog(0x102a3c,22,65);
scene.add(new THREE.HemisphereLight(0xe4f5ff,0x658a75,2.15));
const sun=new THREE.DirectionalLight(0xffe7b1,2.35);sun.position.set(-9,22,13);scene.add(sun);
const camera=new THREE.OrthographicCamera(-14,14,10,-10,.1,100);
const cameraGoal=new THREE.Vector3(-4.6,0,5.4);let zoom=1;
function resize(){
 const w=innerWidth,h=innerHeight,aspect=w/h,vertical=14/zoom;
 camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;
 camera.top=vertical/2;camera.bottom=-vertical/2;camera.updateProjectionMatrix();
 renderer.setSize(w,h,false);
}
function updateCamera(dt){
 const goal=centerCam?new THREE.Vector3(STATE.game.root.position.x,0,STATE.game.root.position.z):cameraGoal;
 cameraGoal.lerp(goal,Math.min(1,dt*3.2));
 camera.position.set(cameraGoal.x+20,cameraGoal.y+21,cameraGoal.z+23);
 camera.lookAt(cameraGoal.x,0,cameraGoal.z);
}
window.addEventListener('resize',resize);resize();
$('zoomIn').onclick=()=>{zoom=Math.min(1.7,zoom+.15);resize();};
$('zoomOut').onclick=()=>{zoom=Math.max(.7,zoom-.15);resize();};
$('centerBtn').onclick=()=>{centerCam=true;STATE.target=null;toast('Câmera centralizada no professor.');};

const MAT={};
function mat(hex){if(!MAT[hex])MAT[hex]=new THREE.MeshStandardMaterial({color:hex,roughness:.85,metalness:0});return MAT[hex];}
function box(x,y,z,w,h,d,color,parent=scene){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));
 mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function sphere(x,y,z,r,color,parent=scene){
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),mat(color));
 mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function cylinder(x,y,z,rTop,rBottom,height,color,parent=scene){
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,height,10),mat(color));
 mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function ground(){
 box(0,-.26,0,29,.5,23,0x49624e);
 box(0,-.012,5.4,28,.13,11.5,0x8cc3ad);
 box(-6.25,.012,-4.35,14.2,.14,8.3,0xe0d2b6);
 box(6.45,.012,-4.35,13.2,.14,8.3,0xdedac6);
 box(0,.015,1.08,28,.13,2.25,0x9bb6ab);
 box(-1.9,.04,6.3,4,.07,6.3,0xc7d1bc);
 box(4.4,.04,6.3,2.4,.07,6.2,0xc7d1bc);
 for(let n=-12;n<13;n+=2){box(n,.068,5.9,.024,.012,9,0xa7d0bd);}
 for(let z=2;z<11;z+=2){box(0,.069,z,27,.011,.024,0xa7d0bd);}
 // Cortes de paredes para deixar salas visíveis em perspectiva isométrica
 box(-6.25,.89,-8.55,14.3,1.65,.32,0xfff0d2);
 box(-13.35,.89,-4.5,.3,1.65,8.2,0xe0a77e);
 box(.8,.89,-4.6,.26,1.65,8,0xe0a77e);
 box(6.55,.89,-8.55,13.1,1.65,.32,0xf6e0cc);
 box(13.1,.89,-4.4,.3,1.65,8.2,0xd5a77e);
 box(6.8,.34,-.13,12,.57,.2,0xc5aa89);
 box(-6.35,.34,-.13,13.8,.57,.2,0xbda788);
 // Colunas
 for(const x of [-12.6,-.4,1.7,12.3])cylinder(x,1.15,.65,.24,.27,2.3,0xdab88f);
 // Fachada da escola
 box(-.1,2.0,1.1,3.1,.5,.42,0x284b60);
 box(-.1,2.44,1.1,3.38,.17,.58,0xf0bc67);
 // Sala e quadros
 box(9.95,1.3,-8.32,3.7,1.22,.09,0x23534d);
 box(-8,1.18,-8.28,2.4,1.0,.10,0x264f51);
 // carteiras
 for(let i=0;i<3;i++)for(let j=0;j<2;j++){
  const x=3.7+i*2.35,z=-6.7+j*2.45;
  box(x,.72,z,1.3,.13,.75,0xb67e50);
  for(const dx of [-.5,.5])for(const dz of [-.25,.25])box(x+dx,.39,z+dz,.08,.69,.07,0x5b514b);
  box(x,.48,z+.8,.76,.1,.36,0x60849a);
 }
 box(10,.74,-5,1.2,.12,.8,0x85573f);
 // estantes da biblioteca
 for(let i=0;i<4;i++){const x=-11.1+i*2.55;box(x,1,-5.9,1.6,1.8,.58,0x856343);
  for(let j=0;j<3;j++){box(x, .48+j*.55,-5.48,1.43,.08,.25,0xd4a269);
   for(let k=0;k<6;k++)box(x-.59+k*.22,.61+j*.55,-5.48,.14,.25,.18,[0x6284a0,0xd78e64,0x88ab89][(i+k+j)%3]);}}
 // bancos e pátio
 for(const x of [-9,9]){box(x,.4,6.4,2.3,.22,.54,0x986f4d);for(const dx of [-.9,.9])box(x+dx,.21,6.4,.1,.38,.38,0x675542);}
 for(const [x,z] of [[-12,9.8],[11,9.8],[-12,2.7],[.8,10]])tree(x,z);
 // jardins
 for(const x of [-9,-7,7,9])for(const z of [9.7,10.3])sphere(x,.24,z,.28,0x537e5e);
 // palco de desafios
 box(10,.15,4.2,3.0,.25,2.4,0x4b687d);
 box(10,.35,3.3,2.3,.36,.3,0xf4cb79);
}
function tree(x,z){
 cylinder(x,.73,z,.20,.25,1.5,0x8e6b4b);
 sphere(x,1.8,z,.96,0x45865c);sphere(x+.42,2.16,z,.65,0x68a56f);sphere(x-.35,2,z-.33,.64,0x6f9b67);
}
ground();

function person(color,x,z,scale=1){
 const root=new THREE.Group();root.position.set(x,0,z);root.scale.setScalar(scale);
 const shadow=new THREE.Mesh(new THREE.CircleGeometry(.38,14),new THREE.MeshBasicMaterial({color:0x142734,transparent:true,opacity:.22}));
 shadow.rotation.x=-Math.PI/2;shadow.position.y=.09;root.add(shadow);
 cylinder(0,.84,0,.32,.26,.9,color,root);
 sphere(0,1.57,0,.32,0xf0bf9d,root);
 sphere(0,1.78,-.05,.29,0x332b2a,root);
 const armL=cylinder(-.41,.89,0,.09,.10,.78,0xf0bf9d,root);
 const armR=cylinder(.41,.89,0,.09,.10,.78,0xf0bf9d,root);
 const legL=box(-.15,.24,0,.17,.46,.20,0x203e57,root);
 const legR=box(.15,.24,0,.17,.46,.20,0x203e57,root);
 sphere(-.11,1.59,.27,.036,0x3e2f2f,root);sphere(.11,1.59,.27,.036,0x3e2f2f,root);
 scene.add(root);return {root,armL,armR,legL,legR};
}
const player=person(0x2b9f97,-4.6,5.4,1.06);
const npcs=[];
const NPC_DATA=[
 ['Mariana',0xf19a71,-10.4,5.2,'aluna'],['Lucas',0x588cc4,-8.0,4.3,'aluno'],
 ['Bia',0xb58acf,-3.4,8.0,'aluna'],['Pedro',0xe2bd61,-7.2,-4.5,'aluno'],
 ['Sofia',0x7cb484,3.6,-4.3,'aluna'],['Rafael',0xd58b70,6.2,-6.0,'aluno'],
 ['Ana',0x7596bd,9.0,-3.9,'aluna'],['Davi',0xa0a37b,1.4,4.5,'aluno'],
 ['Prof. Clara',0xe0a555,5.7,-1.9,'professora'],['Prof. Daniel',0x5e9db4,-3.3,-3.6,'professor']
];
NPC_DATA.forEach((n,i)=>{
 const p=person(n[1],n[2],n[3],n[4].startsWith('prof')?1:.83);
 p.name=n[0];p.role=n[4];p.origin=new THREE.Vector3(n[2],0,n[3]);
 p.goal=p.origin.clone();p.timer=i*.7;p.seed=i*1.27;p.speed=n[4].startsWith('prof')?.62:.46;
 npcs.push(p);
});
const markers=[
 {id:'aula',name:'Sala de aula',description:'Entre na sala e conduza um Reforço Escolar integrado à sua carreira atual.',x:3.5,z:1.28,hex:0xf3cf79},
 {id:'livraria',name:'Biblioteca',description:'Consulte e compre materiais didáticos na Livraria original.',x:-8.3,z:1.15,hex:0xa8d4e5},
 {id:'pvp',name:'Arena PvP',description:'Desafie jogadores reais em debates ou perguntas, usando o sistema atual.',x:10.2,z:5.9,hex:0xf2967c},
 {id:'ranking',name:'Quadro de rankings',description:'Consulte o ranking geral, aulas e classificações competitivas.',x:-9.4,z:7.7,hex:0xeac578},
 {id:'gestao',name:'Gestão escolar',description:'Acesse os negócios e recursos da carreira tradicional.',x:-.2,z:2.5,hex:0xaed59f},
];
markers.forEach(m=>{
 const geo=new THREE.TorusGeometry(.42,.07,6,22);
 const ring=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:m.hex,emissive:m.hex,emissiveIntensity:.22,roughness:.5}));
 ring.rotation.x=-Math.PI/2;ring.position.set(m.x,.16,m.z);scene.add(ring);m.ring=ring;
 const glow=new THREE.Mesh(new THREE.OctahedronGeometry(.28,0),new THREE.MeshStandardMaterial({color:m.hex,emissive:m.hex,emissiveIntensity:.45}));
 glow.position.set(m.x,.85,m.z);scene.add(glow);m.glow=glow;
});
STATE.game=player;

function moveToward(p,x,z,dt,speed){
 const diff=new THREE.Vector3(x-p.root.position.x,0,z-p.root.position.z);
 const dist=diff.length();if(dist<.08)return false;
 diff.normalize();const step=Math.min(dist,speed*dt);
 p.root.position.addScaledVector(diff,step);p.root.rotation.y=Math.atan2(diff.x,diff.z);
 return true;
}
function keepInBounds(position){position.x=THREE.MathUtils.clamp(position.x,-12.6,12.5);position.z=THREE.MathUtils.clamp(position.z,-8.2,10.0);}
function animatePerson(p,t,speedFactor){
 const swing=Math.sin(t*9+p.root.position.x)*.2*speedFactor;
 p.legL.rotation.x=swing;p.legR.rotation.x=-swing;
 p.armL.rotation.x=-swing;p.armR.rotation.x=swing;
}
let nearest=null;
function updateInteract(){
 let item=null,dist=Infinity;
 for(const m of markers){
  const d=Math.hypot(player.root.position.x-m.x,player.root.position.z-m.z);
  if(d<dist){dist=d;item=m;}
 }
 const active=dist<2.15?item:null;
 if((nearest?.id||null)!==(active?.id||null)){
  nearest=active;
  $('interaction').classList.toggle('show',!!active);
  $('actBtn').disabled=!active||STATE.busy;
  if(active){$('interactionName').textContent=active.name;$('interactionDescription').textContent=active.description;}
 }
}
function useInteraction(){
 if(STATE.busy||!nearest)return;
 if(nearest.id==='aula'){
  const c=STATE.state,energy=c?.energy;
  ask('Reforço Escolar','A aula utilizará sua energia, atributos e as regras originais. Saldo, reputação e XP serão alterados somente pelo motor atual. Energia: '+(Number.isFinite(energy)?Math.round(energy)+'%':'não disponível')+'.','Iniciar aula',startLesson);
 }else if(nearest.id==='livraria'){ask('Biblioteca','Abrir a Livraria do jogo clássico, mantendo sua conta e seus recursos.','Abrir Livraria',()=>openClassic('market'));}
 else if(nearest.id==='pvp'){ask('Arena PvP','Abra os desafios online e as partidas existentes. A arena 3D animada será uma atualização posterior.','Abrir PvP',()=>openClassic('pvp'));}
 else if(nearest.id==='ranking'){ask('Ranking de professores','Consultar a classificação atual, incluindo aulas, XP e professores simulados.','Ver ranking',()=>openClassic('ranking'));}
 else if(nearest.id==='gestao'){ask('Gestão escolar','Use suas escolas, negócios e investimentos sem perder o progresso.','Abrir gestão',()=>openClassic('business'));}
}
$('interactBtn').onclick=useInteraction;$('actBtn').onclick=useInteraction;
function gameWindow(){try{return iframe.contentWindow;}catch{return null;}}
function readLegacy(){
 try{
  const w=gameWindow();if(!w?.GameCloud?.canPlay?.())return null;
  const s=w.GameCloud.loadLocalState?.();
  return s&&typeof s==='object'?s:null;
 }catch{return null;}
}
function updateState(){
 const data=readLegacy(),old=STATE.connected;STATE.state=data;STATE.connected=!!data;
 if(data){
  $('loginHelp').classList.remove('show');
  const name=data.subject?'Professor(a) · '+data.subject:'Professor(a)';
  $('playerName').textContent=name;
  $('hudEnergy').textContent='Energia '+Math.round(data.energy||0)+'%';
  $('hudMoney').textContent='R$ '+Math.round(data.money||0).toLocaleString('pt-BR');
  $('hudXp').textContent='XP '+Math.round(data.xp||0).toLocaleString('pt-BR');
  if(!old)toast('Carreira carregada. Seu save está ligado ao jogo original.');
 }else if(!STATE.busy){
  // Dar um breve tempo para o iframe completar o login automático.
  if(elapsed>3) $('loginHelp').classList.add('show');
  $('playerName').textContent='Conta desconectada';
 }
}
function openClassic(tab=null){
 document.body.classList.add('classic');
 const w=gameWindow();
 setTimeout(()=>{
  try{
   if(tab==='pvp')w?.GamePvp?.open?.();
   else if(tab==='ranking')w?.GameRanking?.open?.();
   else if(tab)w?.goTab?.(tab);
  }catch(e){toast('Abra a seção no menu do jogo clássico.');}
 },150);
}
$('classicBtn').onclick=()=>openClassic();
$('loginOpen').onclick=()=>{$('loginHelp').classList.remove('show');openClassic();};
$('closeClassic').onclick=()=>{document.body.classList.remove('classic');updateState();};
iframe.addEventListener('load',()=>setTimeout(updateState,900));
window.addEventListener('storage',e=>{
 if(e.key==='mestre_educacao_auth_session_v1'||(e.key||'').startsWith('mestre_educacao_conta_v1_'))updateState();
});
setInterval(updateState,2800);

async function startLesson(){
 if(STATE.busy)return;
 const w=gameWindow();
 if(!w?.GameCloud?.canPlay?.()){toast('Entre na conta pelo jogo clássico antes de dar aulas.',true);openClassic();return;}
 try{
  if(typeof w.goTab==='function')w.goTab('crimes');
 }catch{}
 const button=w.document.querySelector('[data-action="crime"][data-id="pocket"]');
 if(!button){toast('Atividade não encontrada no motor original. Abra o jogo clássico.',true);return;}
 if(button.disabled){toast('A atividade não está disponível. Verifique energia, atributos e afastamento.',true);return;}
 const before=readLegacy();
 if(!before){toast('O save ainda não está disponível. Abra o jogo clássico.',true);return;}
 STATE.busy=true;$('actBtn').disabled=true;
 STATE.target=null;player.root.position.set(8.9,0,-4.8);
 $('sceneState').textContent='Aula em andamento';
 $('activityFeed').textContent='O professor está ensinando. Aguarde o resultado do motor original.';
 animatePerson(player,10,1);
 await new Promise(resolve=>setTimeout(resolve,1700));
 try{
  // Chamado exatamente uma vez: não recalcular ou gravar recompensas no cliente 3D.
  if(!w.GameCloud?.canPlay?.())throw new Error('Sessão expirada antes da aula.');
  const actual=w.document.querySelector('[data-action="crime"][data-id="pocket"]');
  if(!actual||actual.disabled)throw new Error('Requisitos da aula mudaram. Atualize o jogo.');
  actual.click();
  await new Promise(resolve=>setTimeout(resolve,190));
  const after=readLegacy();
  if(!after||JSON.stringify(before)===JSON.stringify(after))throw new Error('O motor não confirmou a atividade. Verifique se o jogo está aberto em outra aba.');
  const won=Number(after.stats?.wins||0)>Number(before.stats?.wins||0);
  const lost=Number(after.stats?.losses||0)>Number(before.stats?.losses||0);
  const amount=Number(after.money||0)-Number(before.money||0);
  const rep=Number(after.respect||0)-Number(before.respect||0);
  if(won){
   $('sceneState').textContent='Aula concluída!';
   $('activityFeed').textContent='Reforço Escolar aprovado. Recompensas registradas no jogo original.';
   toast('Aula concluída: +R$ '+amount.toLocaleString('pt-BR')+' · +'+rep+' reputação');
  }else if(lost){
   $('sceneState').textContent='Aula difícil';
   $('activityFeed').textContent='O jogo aplicou o resultado de falha e as regras de afastamento.';
   toast('A aula não teve sucesso. Consulte o status da carreira.',true);
  }else{
   $('sceneState').textContent='Atividade registrada';
   $('activityFeed').textContent='Progresso atualizado no motor original.';
   toast('Resultado da atividade registrado.');
  }
  updateState();
 }catch(err){
  $('sceneState').textContent='Aula não confirmada';$('activityFeed').textContent='Nenhuma recompensa adicional foi gerada pela escola 3D.';
  toast(err.message||'Falha ao concluir a aula.',true);
 }finally{
  STATE.busy=false;$('actBtn').disabled=!nearest;
 }
}
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),clickPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
canvas.addEventListener('pointerup',ev=>{
 if(STATE.busy||document.body.classList.contains('classic')||dialog.classList.contains('show'))return;
 const r=canvas.getBoundingClientRect();
 pointer.x=((ev.clientX-r.left)/r.width)*2-1;pointer.y=-((ev.clientY-r.top)/r.height)*2+1;
 ray.setFromCamera(pointer,camera);
 const intersection=new THREE.Vector3();
 if(ray.ray.intersectPlane(clickPlane,intersection)){
  STATE.target={x:THREE.MathUtils.clamp(intersection.x,-12.4,12.4),z:THREE.MathUtils.clamp(intersection.z,-8.1,9.9)};
  centerCam=true;
 }
});
document.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){KEYBOARD.add(k);e.preventDefault();}
 if(k==='e'&&!e.repeat)useInteraction();
});
document.addEventListener('keyup',e=>KEYBOARD.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{KEYBOARD.clear();joystick.x=0;joystick.z=0;});
const pad=$('joystick'),knob=$('knob');
function setStick(ev){
 const r=pad.getBoundingClientRect(),midX=r.left+r.width/2,midY=r.top+r.height/2;
 const dx=ev.clientX-midX,dz=ev.clientY-midY,mag=Math.max(1,Math.hypot(dx,dz)),range=34;
 joystick.x=Math.min(1,mag/range)*dx/mag;joystick.z=Math.min(1,mag/range)*dz/mag;
 knob.style.transform='translate('+(joystick.x*range)+'px,'+(joystick.z*range)+'px)';
}
pad.addEventListener('pointerdown',e=>{e.preventDefault();joystick.pointer=e.pointerId;pad.setPointerCapture(e.pointerId);setStick(e);});
pad.addEventListener('pointermove',e=>{if(joystick.pointer===e.pointerId)setStick(e);});
function stopStick(e){if(joystick.pointer!==e.pointerId)return;joystick.pointer=null;joystick.x=0;joystick.z=0;knob.style.transform='';}
pad.addEventListener('pointerup',stopStick);pad.addEventListener('pointercancel',stopStick);

function animate(){
 const now=performance.now(),dt=Math.min(.05,(now-(animate.last||now))/1000);animate.last=now;
 STATE.time+=dt;elapsed+=dt;
 let dx=(KEYBOARD.has('d')||KEYBOARD.has('arrowright')?1:0)-(KEYBOARD.has('a')||KEYBOARD.has('arrowleft')?1:0)+joystick.x;
 let dz=(KEYBOARD.has('s')||KEYBOARD.has('arrowdown')?1:0)-(KEYBOARD.has('w')||KEYBOARD.has('arrowup')?1:0)+joystick.z;
 let moving=false;
 if(!STATE.busy){
  if(Math.hypot(dx,dz)>.12){
   STATE.target=null;const norm=Math.hypot(dx,dz);dx/=norm;dz/=norm;
   player.root.position.x+=dx*dt*4.3;player.root.position.z+=dz*dt*4.3;
   player.root.rotation.y=Math.atan2(dx,dz);moving=true;
  }else if(STATE.target){
   moving=moveToward(player,STATE.target.x,STATE.target.z,dt,4.3);
   if(!moving)STATE.target=null;
  }
 }
 keepInBounds(player.root.position);animatePerson(player,STATE.time,moving?1:0);
 for(const p of npcs){
  p.timer-=dt;
  if(p.timer<=0){p.timer=2.8+((Math.sin(p.seed+STATE.time)*.5+.5)*4);
   const gx=p.origin.x+Math.sin(p.seed+STATE.time*1.1)*1.2;
   const gz=p.origin.z+Math.cos(p.seed*.9+STATE.time*.7)*1.0;
   p.goal.set(THREE.MathUtils.clamp(gx,-12,12),0,THREE.MathUtils.clamp(gz,-7.8,9.5));
  }
  const walking=moveToward(p,p.goal.x,p.goal.z,dt,p.speed);
  animatePerson(p,STATE.time+p.seed,walking?.65:0);
 }
 for(const m of markers){m.glow.position.y=.80+Math.sin(STATE.time*2+m.x)*.12;m.ring.rotation.z=STATE.time*.38;}
 updateInteract();updateCamera(dt);renderer.render(scene,camera);requestAnimationFrame(animate);
}
$('sceneState').textContent='Escola aberta';
$('activityFeed').textContent='Caminhe com o joystick ou toque no chão. Aproxime-se de um marcador para interagir.';
requestAnimationFrame(animate);
setTimeout(updateState,1700);
