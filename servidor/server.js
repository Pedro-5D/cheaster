"use strict";
// Servidor de Cheaster: sirve el juego y gestiona las partidas online entre dos personas.
// Dependencia única: socket.io. Las jugadas se validan aquí con el MISMO motor (engine.js) que usa el navegador.
//
// Variables de entorno (todas opcionales):
//   PORT      puerto (por defecto 3100)
//   HOST      dirección (por defecto 127.0.0.1; nginx hace de intermediario)
//   ORIGENES  webs que pueden conectarse desde fuera, separadas por comas (por defecto "*")
//   DATOS     carpeta donde se guardan las salas para sobrevivir a un reinicio (por defecto ./datos)

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const E = require(fs.existsSync(path.join(__dirname, "engine.js")) ? "./engine.js" : "../src/engine.js");

const PORT = +process.env.PORT || 3100;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLICO = path.join(__dirname, "public");
const DATOS = process.env.DATOS || path.join(__dirname, "datos");
const ORIGENES = (process.env.ORIGENES || "*").split(",").map(s => s.trim()).filter(Boolean);
const MAX_SALAS = 3000;
const VIDA_SALA_MS = 24 * 3600 * 1000;      // una sala sin actividad dura 24 horas
const AUSENCIA_MS = +process.env.AUSENCIA_MS || 60 * 1000;              // tiempo de desconexión tras el cual se puede reclamar la victoria
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin I, O, 0, 1 para evitar confusiones

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- Archivos estáticos ----------
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};
function estatico(req, res) {
  let ruta;
  try { ruta = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (ruta === "/salud") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, salas: salas.size }));
  }
  if (ruta.endsWith("/")) ruta += "index.html";
  const archivo = path.normalize(path.join(PUBLICO, ruta));
  if (!archivo.startsWith(PUBLICO + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("No encontrado"); }
    const ext = path.extname(archivo).toLowerCase();
    const cache = (ext === ".html" || ext === ".js" || ext === ".webmanifest") ? "no-cache" : "public, max-age=86400";
    res.writeHead(200, {
      "Content-Type": TIPOS[ext] || "application/octet-stream", "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff"
    });
    res.end(datos);
  });
}

const servidor = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  estatico(req, res);
});
const io = new Server(servidor, {
  cors: { origin: ORIGENES.includes("*") ? "*" : ORIGENES },
  maxHttpBufferSize: 2000,
  pingInterval: 20000, pingTimeout: 25000
});

// ---------- Salas ----------
const salas = new Map();

function codigoNuevo() {
  for (;;) {
    let c = "";
    for (let i = 0; i < 5; i++) c += ALFABETO[crypto.randomInt(ALFABETO.length)];
    if (!salas.has(c)) return c;
  }
}
const nuevoAsiento = () => ({ token: null, sid: null, desde: 0 });
const MAX_LISTA = 20, VIDA_LISTA_MS = 3600 * 1000; // en la lista de partidas abiertas: máximo 20, y solo las de la última hora
function empezar(sala) {
  sala.S = E.nuevoEstado(); sala.rep = {}; sala.rep[E.clave(sala.S)] = 1;
  sala.moves = []; sala.sans = []; sala.fin = null; sala.oferta = 0; sala.revancha = { "1": false, "-1": false };
}
function crearSala(colorPedido) {
  const sala = { codigo: codigoNuevo(), ult: Date.now(), creada: Date.now(), publica: false, partida: 1, asientos: { "1": nuevoAsiento(), "-1": nuevoAsiento() } };
  empezar(sala);
  salas.set(sala.codigo, sala);
  return sala;
}
// Repite las jugadas guardadas (al cargar desde disco)
function reproducir(sala, lista) {
  empezar(sala);
  for (const mv of lista) if (!hacerJugada(sala, mv.from, mv.to, mv.promo || 0)) break;
}
function hacerJugada(sala, from, to, promo) {
  const S = sala.S;
  const m = E.legales(S).find(x => x.from === from && x.to === to && (x.promo || 0) === promo);
  if (!m) return null;
  const san = E.notacion(S, m);
  E.hacer(S, m);
  const k = E.clave(S); sala.rep[k] = (sala.rep[k] || 0) + 1;
  sala.moves.push({ from: m.from, to: m.to, promo: m.promo || 0 });
  sala.sans.push(san);
  const est = E.estadoPartida(S, sala.rep);
  if (est.fin) sala.fin = { tipo: est.tipo, ganador: est.ganador };
  return { m, san };
}
const completa = sala => !!(sala.asientos["1"].token && sala.asientos["-1"].token);
const conectado = a => !!a.sid;
function colorDe(sala, socket) {
  for (const c of ["1", "-1"]) if (sala.asientos[c].sid === socket.id) return +c;
  return 0;
}
function vista(sala, color) {
  const rival = sala.asientos[String(-color)];
  return {
    codigo: sala.codigo, color, moves: sala.moves, sans: sala.sans, fin: sala.fin,
    hayRival: !!rival.token, rivalConectado: conectado(rival),
    rivalAusenteMs: rival.token && !conectado(rival) && rival.desde ? Date.now() - rival.desde : 0,
    oferta: sala.oferta, partida: sala.partida, ausenciaMs: AUSENCIA_MS, publica: !!sala.publica,
    revancha: { yo: sala.revancha[String(color)], rival: sala.revancha[String(-color)] }
  };
}
function enviarEstado(sala) {
  for (const c of [1, -1]) {
    const a = sala.asientos[String(c)];
    if (a.sid) io.to(a.sid).emit("estado", vista(sala, c));
  }
}
function tocar(sala) { sala.ult = Date.now(); marcarCambio(); }

// Partidas públicas esperando rival: solo las que tienen al creador conectado y sin segundo jugador
function listaAbiertas() {
  const ahora = Date.now(), lista = [];
  for (const s of salas.values()) {
    if (!s.publica || completa(s) || s.moves.length || ahora - s.creada > VIDA_LISTA_MS) continue;
    const c = s.asientos["1"].token ? 1 : -1;            // color del creador
    if (!conectado(s.asientos[String(c)])) continue;
    lista.push({ codigo: s.codigo, libre: c === 1 ? "negras" : "blancas", hace: Math.round((ahora - s.creada) / 1000) });
  }
  lista.sort((a, b) => a.hace - b.hace);
  return lista.slice(0, MAX_LISTA);
}

// ---------- Guardado en disco ----------
let sucio = false;
function marcarCambio() { sucio = true; }
function guardarDisco() {
  if (!sucio) return; sucio = false;
  try {
    fs.mkdirSync(DATOS, { recursive: true });
    const lista = [...salas.values()].map(s => ({
      codigo: s.codigo, ult: s.ult, creada: s.creada, publica: !!s.publica, partida: s.partida, moves: s.moves, fin: s.fin, oferta: s.oferta, revancha: s.revancha,
      tokens: { "1": s.asientos["1"].token, "-1": s.asientos["-1"].token }
    }));
    const tmp = path.join(DATOS, "salas.json.tmp");
    fs.writeFileSync(tmp, JSON.stringify(lista));
    fs.renameSync(tmp, path.join(DATOS, "salas.json"));
  } catch (e) { log("No se pudo guardar:", e.message); }
}
function cargarDisco() {
  try {
    const lista = JSON.parse(fs.readFileSync(path.join(DATOS, "salas.json"), "utf8"));
    for (const d of lista) {
      if (!d || typeof d.codigo !== "string" || Date.now() - d.ult > VIDA_SALA_MS) continue;
      const s = { codigo: d.codigo, ult: d.ult, creada: d.creada || d.ult, publica: !!d.publica, partida: d.partida || 1, asientos: { "1": nuevoAsiento(), "-1": nuevoAsiento() } };
      reproducir(s, Array.isArray(d.moves) ? d.moves : []);
      s.fin = s.fin || d.fin || null;
      s.oferta = d.oferta || 0;
      if (d.revancha) s.revancha = d.revancha;
      s.asientos["1"].token = d.tokens && d.tokens["1"] || null;
      s.asientos["-1"].token = d.tokens && d.tokens["-1"] || null;
      salas.set(s.codigo, s);
    }
    log("Salas recuperadas:", salas.size);
  } catch (e) { if (e.code !== "ENOENT") log("No se pudieron cargar las salas:", e.message); }
}

// ---------- Limitación de abusos ----------
const cubos = new Map(); // clave -> {n, t}
function limite(clave, max, ventanaMs) {
  const ahora = Date.now(); let c = cubos.get(clave);
  if (!c || ahora - c.t > ventanaMs) { c = { n: 0, t: ahora }; cubos.set(clave, c); }
  return ++c.n <= max;
}
setInterval(() => { const ahora = Date.now(); for (const [k, c] of cubos) if (ahora - c.t > 3600 * 1000) cubos.delete(k); }, 600000).unref();
// Privacidad: el servidor no lee ni guarda direcciones IP (nginx tampoco se las pasa). Los límites son por conexión y globales.

// ---------- Conexiones ----------
io.on("connection", socket => {
  let codigoActual = null;
  const sala = () => (codigoActual && salas.get(codigoActual)) || null;
  const ok = (cb, extra) => { if (typeof cb === "function") cb(Object.assign({ ok: true }, extra)); };
  const error = (cb, mensaje) => { if (typeof cb === "function") cb({ ok: false, error: mensaje }); };
  const limitado = () => !limite("ev:" + socket.id, +process.env.LIMITE_EVENTOS || 60, 10000);

  // Quita este socket de su sala actual (sin borrar su asiento: puede volver con su token)
  function soltar() {
    const s = sala(); if (!s) return;
    const c = colorDe(s, socket);
    if (c) { const a = s.asientos[String(c)]; a.sid = null; a.desde = Date.now(); }
    socket.leave(s.codigo);
    codigoActual = null;
    enviarEstado(s);
  }
  function sentar(s, color) {
    const a = s.asientos[String(color)];
    if (a.sid && a.sid !== socket.id) { // otra pestaña del mismo jugador: la anterior se desconecta de la sala
      const viejo = io.sockets.sockets && io.sockets.sockets.get && io.sockets.sockets.get(a.sid);
      if (viejo) viejo.emit("desplazado");
    }
    a.sid = socket.id; a.desde = 0;
    codigoActual = s.codigo;
    socket.join(s.codigo);
  }

  socket.on("crear", (datos, cb) => {
    if (limitado()) return error(cb, "Demasiadas peticiones");
    if (!limite("crear:" + socket.id, 30, 3600 * 1000) || !limite("crear:todos", 1500, 3600 * 1000)) return error(cb, "Has creado demasiadas partidas. Espera un rato.");
    if (salas.size >= MAX_SALAS) return error(cb, "El servidor está lleno ahora mismo. Inténtalo más tarde.");
    soltar();
    const pedido = datos && datos.color;
    const color = pedido === "blancas" ? 1 : pedido === "negras" ? -1 : (crypto.randomInt(2) ? 1 : -1);
    const s = crearSala();
    s.publica = !!(datos && datos.publica);
    const token = crypto.randomBytes(16).toString("hex");
    s.asientos[String(color)].token = token;
    sentar(s, color);
    tocar(s);
    log("Sala creada", s.codigo, color === 1 ? "(blancas)" : "(negras)", "salas:", salas.size);
    ok(cb, { token, estado: vista(s, color) });
  });

  socket.on("unirse", (datos, cb) => {
    if (limitado()) return error(cb, "Demasiadas peticiones");
    if (!limite("unir:" + socket.id, 120, 3600 * 1000) || !limite("unir:todos", 6000, 3600 * 1000)) return error(cb, "Demasiados intentos. Espera un rato.");
    const codigo = datos && typeof datos.codigo === "string" ? datos.codigo.trim().toUpperCase().slice(0, 8) : "";
    const s = salas.get(codigo);
    if (!s) return error(cb, "No existe esa partida. Puede haber caducado; revisa el código.");
    const tokenRecibido = datos && typeof datos.token === "string" ? datos.token.slice(0, 64) : "";
    let color = 0, token = tokenRecibido;
    if (tokenRecibido) {
      for (const c of ["1", "-1"]) if (s.asientos[c].token === tokenRecibido) color = +c;
    }
    if (!color) { // jugador nuevo: ocupa el asiento libre
      const libres = ["1", "-1"].filter(c => !s.asientos[c].token);
      if (!libres.length) return error(cb, "Esa partida ya tiene dos jugadores.");
      color = +libres[0];
      token = crypto.randomBytes(16).toString("hex");
      s.asientos[String(color)].token = token;
      log("Sala", s.codigo, "completa: se une el segundo jugador");
    }
    if (codigoActual && codigoActual !== s.codigo) soltar();
    sentar(s, color);
    tocar(s);
    ok(cb, { token, estado: vista(s, color) });
    enviarEstado(s); // avisa también al rival (conectado / recién llegado)
  });

  socket.on("listar", (d, cb) => {
    if (limitado()) return error(cb, "Demasiadas peticiones");
    ok(cb, { partidas: listaAbiertas() });
  });

  socket.on("sync", (datos, cb) => {
    const s = sala(); if (!s) return error(cb, "No estás en ninguna partida");
    const c = colorDe(s, socket); if (!c) return error(cb, "No estás en esta partida");
    ok(cb, { estado: vista(s, c) });
  });

  socket.on("jugar", (d, cb) => {
    if (limitado()) return error(cb, "Demasiadas peticiones");
    const s = sala(); if (!s) return error(cb, "No estás en ninguna partida");
    const c = colorDe(s, socket); if (!c) return error(cb, "No estás en esta partida");
    if (!completa(s)) return error(cb, "Aún falta el otro jugador");
    if (s.fin) return error(cb, "La partida ha terminado");
    if (s.S.turn !== c) return error(cb, "No es tu turno");
    const ent = v => Number.isInteger(v) ? v : -1;
    const from = ent(d && d.from), to = ent(d && d.to), promo = d && d.promo ? ent(d.promo) : 0;
    if (from < 0 || from > 35 || to < 0 || to > 35 || ![0, 2, 3, 4].includes(promo)) return error(cb, "Jugada no válida");
    const r = hacerJugada(s, from, to, promo);
    if (!r) { enviarEstado(s); return error(cb, "Jugada no válida"); }
    s.oferta = 0; tocar(s);
    io.to(s.codigo).emit("jugada", { n: s.moves.length, from: r.m.from, to: r.m.to, promo: r.m.promo || 0, san: r.san, fin: s.fin });
    if (s.fin) log("Sala", s.codigo, "terminada:", s.fin.tipo, "ganador", s.fin.ganador);
    ok(cb);
  });

  function terminar(s, fin) {
    s.fin = fin; s.oferta = 0; tocar(s);
    log("Sala", s.codigo, "terminada:", fin.tipo, "ganador", fin.ganador);
    enviarEstado(s);
  }
  socket.on("abandonar", (d, cb) => {
    const s = sala(); if (!s) return error(cb, "No estás en ninguna partida");
    const c = colorDe(s, socket); if (!c) return error(cb, "No estás en esta partida");
    if (s.fin || !completa(s)) return error(cb, "No hay partida en curso");
    terminar(s, { tipo: "abandono", ganador: -c });
    ok(cb);
  });
  socket.on("ofrecerTablas", (d, cb) => {
    if (limitado()) return error(cb, "Demasiadas peticiones");
    const s = sala(); if (!s) return error(cb, "No estás en ninguna partida");
    const c = colorDe(s, socket); if (!c) return error(cb, "No estás en esta partida");
    if (s.fin || !completa(s) || !s.moves.length) return error(cb, "Ahora no se pueden ofrecer tablas");
    if (s.oferta === -c) { terminar(s, { tipo: "acuerdo", ganador: 0 }); return ok(cb); } // ambos las querían
    s.oferta = c; tocar(s); enviarEstado(s); ok(cb);
  });
  socket.on("responderTablas", (d, cb) => {
    const s = sala(); if (!s) return error(cb, "No estás en ninguna partida");
    const c = colorDe(s, socket); if (!c) return error(cb, "No estás en esta partida");
    if (s.fin || s.oferta !== -c) return error(cb, "No hay ninguna oferta de tablas");
    if (d && d.acepta) terminar(s, { tipo: "acuerdo", ganador: 0 });
    else { s.oferta = 0; tocar(s); enviarEstado(s); }
    ok(cb);
  });
  socket.on("reclamar", (d, cb) => {
    const s = sala(); if (!s) return error(cb, "No estás en ninguna partida");
    const c = colorDe(s, socket); if (!c) return error(cb, "No estás en esta partida");
    const rival = s.asientos[String(-c)];
    if (s.fin || !completa(s)) return error(cb, "No hay partida en curso");
    if (conectado(rival) || !rival.desde || Date.now() - rival.desde < AUSENCIA_MS) return error(cb, "Tu rival todavía puede volver");
    terminar(s, { tipo: "ausencia", ganador: c });
    ok(cb);
  });
  socket.on("revancha", (d, cb) => {
    const s = sala(); if (!s) return error(cb, "No estás en ninguna partida");
    const c = colorDe(s, socket); if (!c) return error(cb, "No estás en esta partida");
    if (!s.fin) return error(cb, "La partida aún no ha terminado");
    s.revancha[String(c)] = true;
    if (s.revancha["1"] && s.revancha["-1"]) { // empieza otra partida con los colores cambiados
      const a = s.asientos["1"]; s.asientos["1"] = s.asientos["-1"]; s.asientos["-1"] = a;
      s.partida++; empezar(s);
      log("Sala", s.codigo, "revancha, partida", s.partida);
    }
    tocar(s); enviarEstado(s); ok(cb);
  });
  socket.on("salir", (d, cb) => { soltar(); ok(cb); });

  socket.on("disconnect", () => {
    const s = sala(); if (!s) return;
    const c = colorDe(s, socket);
    if (c) { const a = s.asientos[String(c)]; a.sid = null; a.desde = Date.now(); }
    enviarEstado(s);
  });
});

// Limpieza de salas viejas
setInterval(() => {
  const ahora = Date.now();
  for (const [c, s] of salas) {
    const nadie = !conectado(s.asientos["1"]) && !conectado(s.asientos["-1"]);
    if (ahora - s.ult > VIDA_SALA_MS || (nadie && !completa(s) && ahora - s.ult > 3600 * 1000)) { salas.delete(c); marcarCambio(); }
  }
}, 600000).unref();
setInterval(guardarDisco, 15000).unref();

function apagar() { guardarDisco(); process.exit(0); }
process.on("SIGTERM", apagar);
process.on("SIGINT", apagar);

if (require.main === module) {
  cargarDisco();
  servidor.listen(PORT, HOST, () => log(`Cheaster escuchando en http://${HOST}:${PORT}`));
}
module.exports = { servidor, io, salas };
