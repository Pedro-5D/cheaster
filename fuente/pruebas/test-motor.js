// Compara el motor nuevo con las funciones del juego ORIGINAL (original.html) en miles de posiciones aleatorias.
const fs = require('fs'), E = require('./src/engine.js');
const html = fs.readFileSync(__dirname + '/original.html', 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
// Se extraen solo las funciones de reglas del original
const pick = n => { const i = script.indexOf('function ' + n + '('); let d = 0, j = script.indexOf('{', i); const st = j; for (; j < script.length; j++) { if (script[j] === '{') d++; else if (script[j] === '}') { d--; if (d === 0) break; } } return script.slice(i, j + 1); };
const src = ['getPieceColor', 'isPathBlocked', 'canPieceMove', 'isSquareUnderAttack', 'isValidMoveSimulation'].map(pick).join('\n');
const orig = new Function(src + '; return { isValidMoveSimulation, getPieceColor };')();
const GLIFO = { 1: '♙', 2: '♗', 3: '♖', 4: '♕', 5: '♔', '-1': '♟', '-2': '♝', '-3': '♜', '-4': '♛', '-5': '♚' };
const aGrid = b => { const g = []; for (let r = 0; r < 6; r++) { g.push([]); for (let c = 0; c < 6; c++) g[r].push(b[r * 6 + c] ? GLIFO[b[r * 6 + c]] : ''); } return g; };

let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const partidas = +process.argv[2] || 300;
let posiciones = 0, difs = 0, jaques = 0, mates = 0, ahogados = 0, promos = 0, caps = 0;
for (let g = 0; g < partidas; g++) {
  const s = E.nuevoEstado();
  for (let ply = 0; ply < 160; ply++) {
    const mios = E.legales(s);
    // movimientos legales según el original (por pares origen-destino)
    const grid = aGrid(s.b), ori = new Set();
    for (let f = 0; f < 36; f++) {
      const p = s.b[f]; if (!p || (p > 0 ? 1 : -1) !== s.turn) continue;
      for (let t = 0; t < 36; t++) if (orig.isValidMoveSimulation(grid, (f / 6) | 0, f % 6, (t / 6) | 0, t % 6)) ori.add(f + '-' + t);
    }
    const nuevos = new Set(mios.map(m => m.from + '-' + m.to));
    posiciones++;
    if (ori.size !== nuevos.size || [...ori].some(x => !nuevos.has(x))) { difs++; if (difs <= 3) console.log('DIFERENCIA', s.b.join(','), 'turno', s.turn, [...ori].filter(x => !nuevos.has(x)), [...nuevos].filter(x => !ori.has(x))); }
    // notación y estado de partida no deben fallar
    const st = E.estadoPartida(s, null);
    if (E.enJaque(s, s.turn)) jaques++;
    if (st.fin) { if (st.tipo === 'mate') mates++; else if (st.tipo === 'ahogado') ahogados++; break; }
    const m = mios[Math.floor(rnd() * mios.length)];
    if (m.promo) promos++; if (m.cap) caps++;
    E.notacion(s, m);
    E.hacer(s, m);
  }
}
console.log(`${posiciones} posiciones (${jaques} en jaque, ${mates} mates, ${ahogados} ahogados, ${caps} capturas, ${promos} promociones): ` + (difs ? difs + ' DIFERENCIAS' : 'motor nuevo y juego original COINCIDEN en todas'));
process.exit(difs ? 1 : 0);
