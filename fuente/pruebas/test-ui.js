const {chromium}=require('playwright');const E=require('./src/engine.js');
let fallos=0;const ok=(c,m)=>{if(!c){fallos++;console.log('FALLO:',m)}else console.log('ok  :',m)};
// partidas aleatorias que acaban en mate / ahogado / promoción, para cargarlas en la página
function buscar(cond){for(let g=0;g<5000;g++){const s=E.nuevoEstado(),rep={},lst=[];rep[E.clave(s)]=1;for(let i=0;i<200;i++){const st=E.estadoPartida(s,rep);if(st.fin){if(cond(st,lst))return lst;break}const l=E.legales(s);const m=l[Math.floor(Math.random()*l.length)];lst.push({from:m.from,to:m.to,promo:m.promo||0});E.hacer(s,m);const k=E.clave(s);rep[k]=(rep[k]||0)+1}}return null}
const lMate=buscar(st=>st.tipo==='mate'),lAhog=buscar(st=>st.tipo==='ahogado');
const sq=n=>(6-+n[1])*6+'abcdef'.indexOf(n[0]);
(async()=>{const b=await chromium.launch();
 const nuevo=async(movil,pre)=>{const c=await b.newContext({viewport:movil?{width:390,height:844}:{width:1100,height:800},isMobile:!!movil,hasTouch:!!movil});const p=await c.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));if(pre)await p.addInitScript(pre);await p.goto('file:///home/claude/cheaster/dist/index.html');await p.waitForTimeout(300);return p};
 const clic=async(p,n)=>p.click(`.cas[data-i="${sq(n)}"]`);
 const estado=p=>p.textContent('#estado');
 // 1) dos jugadores: jugadas, notación, turnos, deshacer
 let p=await nuevo();
 await clic(p,'c2');ok(await p.locator('.cas .punto').count()===1,'al tocar el peón c2 sale 1 punto de destino (solo un paso)');
 await clic(p,'c3');ok((await estado(p)).includes('negras'),'tras mover pasa el turno a las negras');
 await clic(p,'d5');await clic(p,'d4');
 const h=await p.textContent('#historial');ok(h.includes('c3')&&h.includes('d4'),'historial: '+h.replace(/\s+/g,' '));
 await p.click('#b-deshacer');ok((await p.textContent('#historial')).includes('c3')&&!(await p.textContent('#historial')).includes('d4'),'deshacer quita la última jugada');
 await p.reload();await p.waitForTimeout(300);ok((await p.textContent('#historial')).includes('c3'),'la partida se guarda al recargar');
 await p.click('#b-girar');ok((await p.$eval('#tablero .cas',e=>e.dataset.i))==='35','girar: la primera casilla pasa a ser h1/f1');
 ok(p.errs.length===0,'sin errores de JS: '+p.errs.join('|'));
 // 2) movimiento ilegal no se acepta
 await p.click('#b-nueva');await clic(p,'a1');ok(await p.locator('.cas.sel').count()===0,'una torre bloqueada no se selecciona');
 await p.close();
 // 3) contra la IA
 p=await nuevo();await p.click('#m-ia');await p.click('#niveles [data-n="hard"]');
 await clic(p,'d2');await clic(p,'d3');
 await p.waitForFunction(()=>window.__cheaster.movimientos.length>=2,null,{timeout:8000});
 ok(true,'la IA responde (nivel difícil)');ok((await estado(p)).includes('Tu turno'),'vuelve el turno al jugador: '+await estado(p));
 await p.click('#b-deshacer');ok(await p.evaluate(()=>window.__cheaster.movimientos.length)===0,'deshacer contra la IA quita jugada del jugador y de la IA');
 // jugar con negras: la IA mueve primero
 await p.click('#colores [data-c="-1"]');await p.waitForFunction(()=>window.__cheaster.movimientos.length===1,null,{timeout:8000});ok(true,'jugando con negras la IA abre la partida');
 ok(await p.evaluate(()=>window.__cheaster.ajustes.girado),'con negras el tablero se gira solo');
 ok(p.errs.length===0,'sin errores de JS (IA): '+p.errs.join('|'));
 await p.close();
 // 4) mate y tablas desde partidas guardadas
 for(const [lst,txt,nombre] of [[lMate,'Jaque mate','jaque mate'],[lAhog,'Rey ahogado','rey ahogado']]){
  if(!lst){console.log('(sin partida de ejemplo para '+nombre+')');continue}
  p=await nuevo(false,`localStorage.setItem('cheaster-v2',${JSON.stringify(JSON.stringify({a:{vsIA:false},m:lst}))})`);
  ok((await p.textContent('#fin-capa')).includes(txt)||(await p.textContent('#estado')).includes(txt.split(' ')[0]),'se anuncia '+nombre+': '+(await p.textContent('#estado')));
  ok(await p.evaluate(()=>document.getElementById('fin-capa').classList.contains('on')),'sale el cartel de fin de partida ('+nombre+')');
  await p.click('#fin-nueva');ok((await p.evaluate(()=>window.__cheaster.movimientos.length))===0,'Nueva partida desde el cartel');
  await p.close();
 }
 // 5) coronación con elección (posición de ejemplo hallada con el motor: a las blancas les toca y tienen una coronación)
 let ejPromo=null;for(let g=0;g<20000&&!ejPromo;g++){const s=E.nuevoEstado(),lst=[];for(let i=0;i<120;i++){const l=E.legales(s);if(!l.length)break;if(s.turn===1&&l.some(m=>m.promo)){ejPromo={lst:lst.slice(),m:l.find(m=>m.promo)};break}const m=l[Math.floor(Math.random()*l.length)];lst.push({from:m.from,to:m.to,promo:m.promo||0});E.hacer(s,m)}}
 p=await nuevo(false,`localStorage.setItem('cheaster-v2',${JSON.stringify(JSON.stringify({a:{vsIA:false},m:ejPromo.lst}))})`);
 await p.click(`.cas[data-i="${ejPromo.m.from}"]`);await p.click(`.cas[data-i="${ejPromo.m.to}"]`);
 ok(await p.evaluate(()=>document.getElementById('capa-promo').classList.contains('on')),'al llegar al final sale el panel de coronación');
 ok(await p.locator('#promo-opciones button').count()===3,'solo 3 opciones (dama, torre, alfil)');
 await p.click('#promo-opciones button:first-child');ok((await p.textContent('#historial')).includes('=D'),'coronada a dama y anotada: '+(await p.textContent('#historial')).replace(/\s+/g,' ').slice(-40));
 ok(p.errs.length===0,'sin errores de JS (coronación): '+p.errs.join('|'));
 await p.close();
 // 6) móvil: toque y altura para iframe
 p=await nuevo(true);await p.tap(`.cas[data-i="${sq('e2')}"]`);await p.tap(`.cas[data-i="${sq('e3')}"]`);
 ok((await p.textContent('#historial')).includes('e3'),'en móvil se juega tocando');
 const sw=await p.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]);ok(sw[0]<=sw[1],'sin desbordamiento horizontal en móvil '+sw);
 await p.close();
 console.log(fallos?fallos+' FALLOS':'TODO OK');await b.close();process.exit(fallos?1:0)})();
