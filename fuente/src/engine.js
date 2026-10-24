// engine.js - Reglas, tablas e IA de Cheaster (ajedrez 6x6 sin caballos).
// Sin dependencias del navegador: funciona en la página, en un Web Worker y en Node (para las pruebas).
//
// Tablero: array de 36 casillas, índice = fila*6 + columna; fila 0 = arriba (lado negro), fila 5 = abajo (lado blanco).
// Piezas: números con signo; positivo = blancas, negativo = negras. 1 peón, 2 alfil, 3 torre, 4 dama, 5 rey.
// Peones: un solo paso, capturan en diagonal, coronan en Dama/Torre/Alfil. No hay enroque ni al paso.
const N = 6;
const P = 1, B = 2, R = 3, Q = 4, K = 5;
const WHITE = 1, BLACK = -1;
const VALOR = [0, 100, 300, 500, 900, 0];
const MATE = 100000;

const INICIAL = [
  -R, -B, -Q, -K, -B, -R,
  -P, -P, -P, -P, -P, -P,
  0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0,
  P, P, P, P, P, P,
  R, B, Q, K, B, R
];

const DIR_ALFIL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const DIR_TORRE = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIR_TODAS = DIR_ALFIL.concat(DIR_TORRE);

function nuevoEstado() {
  return { b: INICIAL.slice(), turn: WHITE, half: 0 };
}
function copiaEstado(s) { return { b: s.b.slice(), turn: s.turn, half: s.half }; }
function clave(s) { return s.b.join(",") + "|" + s.turn; }

// ¿Está la casilla sq atacada por el bando "by"?
function atacada(b, sq, by) {
  const r = (sq / N) | 0, c = sq % N;
  // peones: un peón blanco ataca hacia arriba (fila-1), así que el atacante está una fila por debajo
  const rp = by === WHITE ? r + 1 : r - 1;
  if (rp >= 0 && rp < N) {
    if (c > 0 && b[rp * N + c - 1] === by * P) return true;
    if (c < N - 1 && b[rp * N + c + 1] === by * P) return true;
  }
  // rey
  for (const [dr, dc] of DIR_TODAS) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === by * K) return true;
  }
  // alfil/dama en diagonal, torre/dama en recta
  for (const [dr, dc] of DIR_ALFIL) {
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < N && cc >= 0 && cc < N) {
      const p = b[rr * N + cc];
      if (p) { if (p === by * B || p === by * Q) return true; break; }
      rr += dr; cc += dc;
    }
  }
  for (const [dr, dc] of DIR_TORRE) {
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < N && cc >= 0 && cc < N) {
      const p = b[rr * N + cc];
      if (p) { if (p === by * R || p === by * Q) return true; break; }
      rr += dr; cc += dc;
    }
  }
  return false;
}

function posRey(b, color) {
  const k = color * K;
  for (let i = 0; i < 36; i++) if (b[i] === k) return i;
  return -1;
}
function enJaque(s, color) {
  const k = posRey(s.b, color);
  return k >= 0 && atacada(s.b, k, -color);
}

// Movimientos pseudo-legales (sin comprobar el jaque propio). Cada uno: {from,to,promo,cap}
function pseudo(s, soloCapturas) {
  const b = s.b, us = s.turn, mov = [];
  for (let from = 0; from < 36; from++) {
    const p = b[from];
    if (!p || (p > 0 ? WHITE : BLACK) !== us) continue;
    const t = Math.abs(p), r = (from / N) | 0, c = from % N;
    if (t === P) {
      const dr = us === WHITE ? -1 : 1, rr = r + dr, ult = us === WHITE ? 0 : N - 1;
      if (rr < 0 || rr >= N) continue;
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (cc < 0 || cc >= N) continue;
        const to = rr * N + cc, o = b[to];
        if (o && (o > 0 ? WHITE : BLACK) !== us) {
          if (rr === ult) for (const pr of [Q, R, B]) mov.push({ from, to, promo: pr, cap: o });
          else mov.push({ from, to, promo: 0, cap: o });
        }
      }
      const to = rr * N + c;
      if (!b[to]) {
        if (rr === ult) { for (const pr of [Q, R, B]) mov.push({ from, to, promo: pr, cap: 0 }); }
        else if (!soloCapturas) mov.push({ from, to, promo: 0, cap: 0 });
      }
    } else if (t === K) {
      for (const [dr, dc] of DIR_TODAS) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const to = rr * N + cc, o = b[to];
        if (o && (o > 0 ? WHITE : BLACK) === us) continue;
        if (soloCapturas && !o) continue;
        mov.push({ from, to, promo: 0, cap: o });
      }
    } else {
      const dirs = t === B ? DIR_ALFIL : t === R ? DIR_TORRE : DIR_TODAS;
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < N && cc >= 0 && cc < N) {
          const to = rr * N + cc, o = b[to];
          if (o) {
            if ((o > 0 ? WHITE : BLACK) !== us) mov.push({ from, to, promo: 0, cap: o });
            break;
          }
          if (!soloCapturas) mov.push({ from, to, promo: 0, cap: 0 });
          rr += dr; cc += dc;
        }
      }
    }
  }
  return mov;
}

// Aplica el movimiento sobre el estado y devuelve lo necesario para deshacerlo.
function hacer(s, m) {
  const b = s.b, p = b[m.from];
  const u = { from: m.from, to: m.to, p, cap: b[m.to], half: s.half };
  b[m.to] = m.promo ? (p > 0 ? m.promo : -m.promo) : p;
  b[m.from] = 0;
  s.half = (Math.abs(p) === P || u.cap) ? 0 : s.half + 1;
  s.turn = -s.turn;
  return u;
}
function deshacer(s, u) {
  s.b[u.from] = u.p;
  s.b[u.to] = u.cap;
  s.half = u.half;
  s.turn = -s.turn;
}

// Movimientos legales (los que no dejan al propio rey en jaque)
function legales(s, soloCapturas) {
  const res = [], us = s.turn;
  for (const m of pseudo(s, soloCapturas)) {
    const u = hacer(s, m);
    const ok = !enJaque(s, us);
    deshacer(s, u);
    if (ok) res.push(m);
  }
  return res;
}

function materialInsuficiente(b) {
  let alfiles = 0;
  for (let i = 0; i < 36; i++) {
    const t = Math.abs(b[i]);
    if (t === P || t === R || t === Q) return false;
    if (t === B) alfiles++;
  }
  return alfiles <= 1; // rey solo, o rey y un alfil contra rey
}

// Estado de la partida. repeticiones: objeto {clave: veces} con las posiciones ya ocurridas (incluida la actual)
// Devuelve {fin:false} o {fin:true, tipo:'mate'|'ahogado'|'repeticion'|'material'|'cincuenta', ganador:1|-1|0}
function estadoPartida(s, repeticiones) {
  const mov = legales(s);
  if (mov.length === 0) {
    if (enJaque(s, s.turn)) return { fin: true, tipo: "mate", ganador: -s.turn };
    return { fin: true, tipo: "ahogado", ganador: 0 };
  }
  if (materialInsuficiente(s.b)) return { fin: true, tipo: "material", ganador: 0 };
  if (repeticiones && repeticiones[clave(s)] >= 3) return { fin: true, tipo: "repeticion", ganador: 0 };
  if (s.half >= 100) return { fin: true, tipo: "cincuenta", ganador: 0 };
  return { fin: false, jaque: enJaque(s, s.turn) };
}

// ---- Notación ----
const COLS = "abcdef";
const LETRA = { 2: "A", 3: "T", 4: "D", 5: "R" };
function nombreCasilla(sq) { return COLS[sq % N] + (N - ((sq / N) | 0)); }
// Notación estilo algebraico en español: R rey, D dama, T torre, A alfil. Se calcula ANTES de hacer el movimiento.
function notacion(s, m) {
  const p = s.b[m.from], t = Math.abs(p), dest = nombreCasilla(m.to), cap = m.cap ? "x" : "";
  let txt;
  if (t === P) {
    txt = (m.cap ? COLS[m.from % N] + "x" : "") + dest + (m.promo ? "=" + LETRA[m.promo] : "");
  } else {
    let desamb = "";
    const otros = legales(s).filter(o => o.to === m.to && o.from !== m.from && s.b[o.from] === p);
    if (otros.length) {
      const mismaCol = otros.some(o => o.from % N === m.from % N);
      const mismaFila = otros.some(o => ((o.from / N) | 0) === ((m.from / N) | 0));
      if (!mismaCol) desamb = COLS[m.from % N];
      else if (!mismaFila) desamb = String(N - ((m.from / N) | 0));
      else desamb = nombreCasilla(m.from);
    }
    txt = LETRA[t] + desamb + cap + dest;
  }
  const u = hacer(s, m);
  const ent = legales(s).length === 0;
  const jaque = enJaque(s, s.turn);
  deshacer(s, u);
  return txt + (jaque ? (ent ? "#" : "+") : "");
}

// ---- Evaluación y búsqueda ----
function evaluar(s) {
  // Valor desde el punto de vista del bando que mueve (negamax)
  const b = s.b;
  let score = 0, alfW = 0, alfB = 0;
  for (let i = 0; i < 36; i++) {
    const p = b[i];
    if (!p) continue;
    const t = Math.abs(p), col = p > 0 ? 1 : -1, r = (i / N) | 0, c = i % N;
    let v = VALOR[t];
    const avance = col === WHITE ? (N - 1 - r) : r;       // filas avanzadas
    const centro = 2.5 - Math.abs(c - 2.5) + 2.5 - Math.abs(r - 2.5); // 0..5
    if (t === P) v += avance * 12 + (c === 2 || c === 3 ? 6 : 0) + (avance >= 4 ? 25 : 0);
    else if (t === B) { v += centro * 5; col === WHITE ? alfW++ : alfB++; }
    else if (t === R) v += centro * 2;
    else if (t === Q) v += centro * 3;
    else if (t === K) { v += (avance <= 1 ? 8 : -avance * 6); } // el rey mejor atrás en el medio juego
    score += col * v;
  }
  if (alfW >= 2) score += 25;
  if (alfB >= 2) score -= 25;
  return s.turn * score;
}

function ordenar(mov) {
  mov.forEach(m => {
    m.o = (m.cap ? 10 * VALOR[Math.abs(m.cap)] - 1 : 0) + (m.promo ? 800 : 0);
  });
  mov.sort((a, c) => c.o - a.o);
}

function Buscador(limiteMs) {
  this.fin = Date.now() + limiteMs;
  this.nodos = 0;
  this.cancelado = false;
}
Buscador.prototype.quiescencia = function (s, alfa, beta, prof) {
  const e = evaluar(s);
  if (prof <= 0) return e;
  if (e >= beta) return e;
  if (e > alfa) alfa = e;
  const mov = legales(s, true);
  ordenar(mov);
  for (const m of mov) {
    const u = hacer(s, m);
    const v = -this.quiescencia(s, -beta, -alfa, prof - 1);
    deshacer(s, u);
    if (v >= beta) return v;
    if (v > alfa) alfa = v;
  }
  return alfa;
};
Buscador.prototype.negamax = function (s, prof, alfa, beta, ply) {
  if ((++this.nodos & 1023) === 0 && Date.now() > this.fin) this.cancelado = true;
  if (this.cancelado) return 0;
  if (s.half >= 100) return 0;
  const enJ = enJaque(s, s.turn);
  if (prof <= 0 && !enJ) return this.quiescencia(s, alfa, beta, 4);
  const mov = legales(s);
  if (mov.length === 0) return enJ ? -(MATE - ply) : 0;
  ordenar(mov);
  let mejor = -Infinity;
  for (const m of mov) {
    const u = hacer(s, m);
    const v = -this.negamax(s, prof - 1, -beta, -alfa, ply + 1);
    deshacer(s, u);
    if (this.cancelado) return 0;
    if (v > mejor) mejor = v;
    if (mejor > alfa) alfa = mejor;
    if (alfa >= beta) break;
  }
  return mejor;
};

// Niveles: easy = casi aleatoria con capturas; medium = búsqueda corta; hard = búsqueda profunda con tiempo limitado
const NIVELES = {
  easy:   { prof: 1, ms: 150,  margen: 0,  azar: 0.35 },
  medium: { prof: 3, ms: 500,  margen: 12, azar: 0 },
  hard:   { prof: 8, ms: 1500, margen: 0,  azar: 0 }
};

// Elige el movimiento de la IA para el bando que mueve. repeticiones: {clave: veces} para evitar tablas cuando va ganando.
function elegirMovimiento(estado, nivel, repeticiones) {
  const cfg = NIVELES[nivel] || NIVELES.medium;
  const s = copiaEstado(estado);
  const mov = legales(s);
  if (!mov.length) return null;
  if (mov.length === 1) return mov[0];

  if (cfg.azar && Math.random() < cfg.azar) {
    // jugada al azar (con preferencia por capturas la mitad de las veces)
    const caps = mov.filter(m => m.cap);
    if (caps.length && Math.random() < 0.5) return caps[Math.floor(Math.random() * caps.length)];
    return mov[Math.floor(Math.random() * mov.length)];
  }

  const busc = new Buscador(cfg.ms);
  let resultado = null; // lista [{m, v}] de la última profundidad completada
  ordenar(mov);
  for (let prof = 1; prof <= cfg.prof; prof++) {
    const lista = [];
    for (const m of mov) {
      const u = hacer(s, m);
      let v = -busc.negamax(s, prof - 1, -Infinity, Infinity, 1);
      const k = clave(s);
      deshacer(s, u);
      if (busc.cancelado) break;
      // si va ganando, no aceptar tablas por repetición
      if (repeticiones && (repeticiones[k] || 0) >= 2 && estadoMaterial(s) > 150) v = -MATE / 2;
      lista.push({ m, v });
    }
    if (busc.cancelado) break;
    resultado = lista;
    lista.sort((a, c) => c.v - a.v);
    if (lista[0].v > MATE - 50) break; // mate encontrado
    // reordenar para la siguiente profundidad
    mov.length = 0;
    for (const x of lista) mov.push(x.m);
  }
  if (!resultado) return mov[0];
  // valores exactos de todos los movimientos de la última profundidad completada: se elige al azar entre los casi iguales
  const mejor = Math.max(...resultado.map(x => x.v));
  const cand = resultado.filter(x => x.v >= mejor - cfg.margen);
  return cand[Math.floor(Math.random() * cand.length)].m;
}
// Material desde el punto de vista del bando que acaba de mover (el contrario del turno actual)
function estadoMaterial(s) {
  let m = 0;
  for (let i = 0; i < 36; i++) { const p = s.b[i]; if (p) m += (p > 0 ? 1 : -1) * VALOR[Math.abs(p)]; }
  return -s.turn * m;
}

const API = {
  N, P, B, R, Q, K, WHITE, BLACK, INICIAL, NIVELES,
  nuevoEstado, copiaEstado, clave, atacada, enJaque, legales, hacer, deshacer,
  estadoPartida, notacion, nombreCasilla, elegirMovimiento, materialInsuficiente, evaluar
};
if (typeof module !== "undefined" && module.exports) module.exports = API;
