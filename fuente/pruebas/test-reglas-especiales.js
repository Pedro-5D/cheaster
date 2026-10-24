const E = require('./src/engine.js'); const { P, B, R, Q, K } = E;
let fallos = 0; const ok = (c, msg) => { if (!c) { fallos++; console.log('FALLO:', msg); } };
const pos = (piezas, turno = 1) => { const b = new Array(36).fill(0); for (const [sq, p] of piezas) b[sq] = p; return { b, turn: turno, half: 0 }; };
const sq = n => (6 - +n[1]) * 6 + 'abcdef'.indexOf(n[0]);
// Rey ahogado: rey negro a1? negro en a6 (fila0 col0), blancas: dama en b4, rey en c? ... negro en a6, dama blanca c5, rey blanco b? => negro sin movimientos y sin jaque
let s = pos([[sq('a6'), -K], [sq('c5'), Q], [sq('c4'), K]], -1);
ok(E.estadoPartida(s).tipo === 'ahogado', 'rey ahogado'); 
// Mate: rey negro a6, torre blanca a1? + torre b2? mate de dos torres: negro en a6; torres blancas b5 y a? ->
s = pos([[sq('a6'), -K], [sq('a1'), R], [sq('b2'), R], [sq('f1'), K]], -1);
ok(E.estadoPartida(s).tipo === 'mate' && E.estadoPartida(s).ganador === 1, 'jaque mate de dos torres');
// Material insuficiente
ok(E.estadoPartida(pos([[0, -K], [35, K]]), {}).tipo === 'material', 'rey contra rey');
ok(E.estadoPartida(pos([[0, -K], [35, K], [20, B]]), {}).tipo === 'material', 'rey y alfil contra rey');
ok(E.estadoPartida(pos([[0, -K], [35, K], [20, P]]), {}).fin === false, 'con peón sigue');
// Repetición
const st3 = E.nuevoEstado(); const rep = {}; rep[E.clave(st3)] = 3;
ok(E.estadoPartida(st3, rep).tipo === 'repeticion', 'repetición triple');
// 50 jugadas
const st50 = E.nuevoEstado(); st50.half = 100;
ok(E.estadoPartida(st50, {}).tipo === 'cincuenta', 'regla de 50 jugadas');
// Promoción y notación
s = pos([[sq('b5'), P], [sq('f6'), -K], [sq('f1'), K]]);
const mp = E.legales(s).filter(m => m.promo);
ok(mp.length === 3, 'tres promociones (dama, torre, alfil), sin caballo');
ok(!mp.some(m => m.promo === 6), 'sin caballo');
// Notación con captura de peón, jaque y desambiguación
s = pos([[sq('a1'), R], [sq('c1'), R], [sq('f6'), -K], [sq('f1'), K], [sq('b1'), 0]]);
const tx = E.legales(s).map(m => E.notacion(s, m));
ok(tx.includes('Tab1') || tx.includes('Tab1+'), 'desambiguación por columna: ' + tx.filter(x => x.includes('b1')).join(','));
s = E.nuevoEstado();
ok(E.notacion(s, E.legales(s).find(m => m.from === sq('a2') && m.to === sq('a3'))) === 'a3', 'notación de peón');
// Nunca se puede dejar al rey en jaque: ningún movimiento legal deja al propio rey atacado
for (let i = 0; i < 300; i++) { const t = E.nuevoEstado(); for (let ply = 0; ply < 80; ply++) { const l = E.legales(t); if (!l.length) break; const us = t.turn; const m = l[Math.floor(Math.random() * l.length)]; E.hacer(t, m); ok(!E.enJaque(t, us), 'dejó al rey en jaque'); } }
console.log(fallos ? fallos + ' fallos' : 'todas las pruebas de reglas especiales OK'); process.exit(fallos ? 1 : 0);
