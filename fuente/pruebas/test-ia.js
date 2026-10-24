const E = require('./src/engine.js');
function jugar(blancas, negras, maxPly = 120) {
  const s = E.nuevoEstado(), rep = {}; rep[E.clave(s)] = 1; let ms = [0, 0];
  for (let ply = 0; ply < maxPly; ply++) {
    const st = E.estadoPartida(s, rep);
    if (st.fin) return { res: st.tipo, ganador: st.ganador, ply, ms };
    const nivel = s.turn === 1 ? blancas : negras;
    const t0 = Date.now();
    const m = nivel === 'azar' ? (l => l[Math.floor(Math.random() * l.length)])(E.legales(s)) : E.elegirMovimiento(s, nivel, rep);
    ms[s.turn === 1 ? 0 : 1] = Math.max(ms[s.turn === 1 ? 0 : 1], Date.now() - t0);
    E.hacer(s, m); const k = E.clave(s); rep[k] = (rep[k] || 0) + 1;
  }
  return { res: 'limite', ganador: 0, ply: maxPly, ms };
}
function torneo(a, b, n) {
  let ga = 0, gb = 0, t = 0, mx = 0;
  for (let i = 0; i < n; i++) {
    const r = i % 2 === 0 ? jugar(a, b) : jugar(b, a);
    const gan = i % 2 === 0 ? r.ganador : -r.ganador;
    if (gan === 1) ga++; else if (gan === -1) gb++; else t++;
    mx = Math.max(mx, ...r.ms);
  }
  console.log(`${a} vs ${b}: ${a} gana ${ga}, ${b} gana ${gb}, tablas/límite ${t}  (jugada más lenta ${mx} ms)`);
}
torneo('easy', 'azar', 10);
torneo('medium', 'easy', 10);
torneo('hard', 'medium', 6);
