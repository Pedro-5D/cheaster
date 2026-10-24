const { spawn } = require("child_process");
const path = require("path"), fs = require("fs"), os = require("os");
const { conectar } = require("./cli.js");
const E = require("/home/claude/cheaster/src/engine.js");
const PUERTO = 3199;
const datos = fs.mkdtempSync(path.join(os.tmpdir(), "chs-"));
let proc;
const dormir = ms => new Promise(r => setTimeout(r, ms));
function arrancar() {
  proc = spawn("node", ["/home/claude/cheaster/server/server.js"], { env: Object.assign({}, process.env, { PORT: PUERTO, DATOS: datos, AUSENCIA_MS: "800", LIMITE_EVENTOS: "100000", NODE_PATH: path.join(__dirname, "fake/node_modules") }), stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", () => {}); proc.stderr.on("data", d => process.stderr.write(d));
  return dormir(700);
}
let fallos = 0, pruebas = 0;
const ok = (c, msg) => { pruebas++; if (!c) { fallos++; console.log("FALLO:", msg); } };
async function main() {
  await arrancar();
  // --- crear y unirse
  const A = await conectar(PUERTO), B = await conectar(PUERTO), C = await conectar(PUERTO);
  let r = await A.emit("crear", { color: "negras" });
  ok(r.ok && r.estado.color === -1 && /^[A-Z2-9]{5}$/.test(r.estado.codigo) && !r.estado.hayRival, "crear negras");
  const cod = r.estado.codigo, tokA = r.token;
  r = await B.emit("unirse", { codigo: cod.toLowerCase() });
  ok(r.ok && r.estado.color === 1 && r.estado.hayRival && r.estado.rivalConectado, "unirse recibe blancas");
  const tokB = r.token;
  await dormir(100);
  ok(A.ultimo("estado") && A.ultimo("estado").hayRival, "A es avisado de que llegó el rival");
  r = await C.emit("unirse", { codigo: cod });
  ok(!r.ok && /dos jugadores/.test(r.error), "tercero rechazado");
  r = await C.emit("unirse", { codigo: "ZZZZZ" });
  ok(!r.ok && /No existe/.test(r.error), "sala inexistente");
  r = await C.emit("unirse", { codigo: cod, token: "falso" });
  ok(!r.ok, "token falso no entra");
  // --- validación de jugadas
  r = await A.emit("jugar", { from: 6, to: 12, promo: 0 }); ok(!r.ok && /turno/.test(r.error), "negras no pueden abrir");
  r = await B.emit("jugar", { from: 0, to: 35 }); ok(!r.ok && /no válida/.test(r.error), "jugada ilegal");
  r = await B.emit("jugar", { from: "a", to: {} }); ok(!r.ok, "basura rechazada");
  r = await B.emit("jugar", null); ok(!r.ok, "null rechazado");
  r = await B.emit("jugar", { from: 24, to: 18, promo: 0 }); ok(r.ok, "jugada legal a2-a3");
  await dormir(100);
  ok(A.ultimo("jugada") && A.ultimo("jugada").n === 1 && A.ultimo("jugada").san, "A recibe la jugada");
  r = await B.emit("jugar", { from: 18, to: 12 }); ok(!r.ok && /turno/.test(r.error), "no mueve dos veces");
  // --- partidas aleatorias completas validadas contra el motor
  const resumen = {};
  for (let g = 0; g < 12; g++) {
    const X = await conectar(PUERTO), Y = await conectar(PUERTO);
    const rc = await X.emit("crear", { color: "blancas" }); const ry = await Y.emit("unirse", { codigo: rc.estado.codigo });
    const S = E.nuevoEstado(), rep = {}; rep[E.clave(S)] = 1; let fin = null, n = 0;
    while (!fin && n < 600) {
      const mov = E.legales(S); const m = mov[Math.floor(Math.random() * mov.length)];
      const cli = S.turn === 1 ? X : Y;
      const rr = await cli.emit("jugar", { from: m.from, to: m.to, promo: m.promo || 0 });
      if (!rr.ok) { ok(false, "jugada legal rechazada: " + rr.error); break; }
      E.hacer(S, m); const k = E.clave(S); rep[k] = (rep[k] || 0) + 1; n++;
      const est = E.estadoPartida(S, rep); if (est.fin) fin = est;
    }
    await dormir(60);
    const sf = X.ultimo("jugada").fin;
    ok(fin && sf && sf.tipo === fin.tipo && sf.ganador === fin.ganador, "fin coincide con el motor " + JSON.stringify([fin, sf]));
    resumen[fin ? fin.tipo : "sin fin"] = (resumen[fin ? fin.tipo : "sin fin"] || 0) + 1;
    const rj = await X.emit("jugar", { from: 0, to: 6 }); ok(!rj.ok && /terminado/.test(rj.error), "no se juega tras el final");
    X.cerrar(); Y.cerrar();
  }
  console.log("Finales de partidas aleatorias:", JSON.stringify(resumen));
  // --- tablas
  r = await A.emit("ofrecerTablas", {}); ok(r.ok, "A ofrece tablas");
  await dormir(80); ok(B.ultimo("estado").oferta === -1 || B.ultimo("estado").oferta === 1, "B ve la oferta");
  r = await A.emit("responderTablas", { acepta: true }); ok(!r.ok, "quien ofrece no puede aceptar su propia oferta");
  r = await B.emit("responderTablas", { acepta: false }); ok(r.ok, "B rechaza");
  await dormir(80); ok(A.ultimo("estado").oferta === 0, "oferta limpia");
  await B.emit("ofrecerTablas", {}); r = await A.emit("responderTablas", { acepta: true }); ok(r.ok, "A acepta");
  await dormir(80); ok(A.ultimo("estado").fin && A.ultimo("estado").fin.tipo === "acuerdo", "fin por acuerdo");
  // --- revancha: colores cambian
  const antesA = A.ultimo("estado").color;
  r = await A.emit("revancha", {}); ok(r.ok, "A pide revancha");
  await dormir(80); ok(B.ultimo("estado").revancha.rival === true, "B ve que A quiere revancha");
  await B.emit("revancha", {}); await dormir(100);
  const eA = A.ultimo("estado");
  ok(eA.color === -antesA && eA.moves.length === 0 && !eA.fin && eA.partida === 2, "revancha: colores cambiados y tablero limpio");
  // --- abandono
  
  r = await A.emit("abandonar", {}); ok(r.ok, "A abandona");
  await dormir(80); const f = B.ultimo("estado").fin; ok(f && f.tipo === "abandono" && f.ganador === B.ultimo("estado").color, "gana B por abandono");
  // --- reconexión + ausencia
  await B.emit("revancha", {}); await A.emit("revancha", {}); await dormir(100);
  const colA = A.ultimo("estado").color; A.cerrar(); await dormir(150);
  ok(B.ultimo("estado").rivalConectado === false, "B ve a A desconectado");
  r = await B.emit("reclamar", {}); ok(!r.ok, "no se puede reclamar enseguida");
  await dormir(900);
  const A2 = await conectar(PUERTO);
  r = await A2.emit("unirse", { codigo: cod, token: tokA }); ok(r.ok && r.estado.color === colA && r.estado.rivalConectado, "A vuelve con su token");
  A2.cerrar(); await dormir(1000);
  r = await B.emit("reclamar", {}); ok(r.ok, "tras la ausencia se puede reclamar");
  await dormir(80); ok(B.ultimo("estado").fin.tipo === "ausencia" && B.ultimo("estado").fin.ganador === B.ultimo("estado").color, "gana B por ausencia");
  // --- persistencia: reinicio del servidor
  const antes = B.ultimo("estado");
  proc.kill("SIGTERM"); await dormir(400); B.cerrar();
  await arrancar();
  const A3 = await conectar(PUERTO);
  r = await A3.emit("unirse", { codigo: cod, token: tokA });
  ok(r.ok && r.estado.fin && r.estado.fin.tipo === "ausencia" && r.estado.moves.length === antes.moves.length && r.estado.partida === antes.partida, "la sala sobrevive al reinicio");
  const B3 = await conectar(PUERTO);
  r = await B3.emit("unirse", { codigo: cod, token: tokB }); ok(r.ok, "B también");
  // --- sync y salir
  r = await A3.emit("sync", {}); ok(r.ok && r.estado.codigo === cod, "sync");
  await A3.emit("salir", {}); await dormir(80); ok(B3.ultimo("estado").rivalConectado === false, "salir marca desconectado");
  r = await A3.emit("sync", {}); ok(!r.ok, "sync sin sala");
  // --- lista pública
  const L1 = await conectar(PUERTO), L2 = await conectar(PUERTO), L3 = await conectar(PUERTO);
  let lr = await L1.emit("crear", { color: "blancas", publica: true }); const codPub = lr.estado.codigo;
  ok(lr.estado.publica === true, "sala marcada como pública");
  await L2.emit("crear", { color: "negras", publica: false });
  lr = await L3.emit("listar", {});
  ok(lr.ok && lr.partidas.length === 1 && lr.partidas[0].codigo === codPub && lr.partidas[0].libre === "negras", "solo aparece la pública, con el color libre");
  await L3.emit("unirse", { codigo: codPub });
  lr = await L2.emit("listar", {}); ok(lr.partidas.length === 0, "la llena sale de la lista");
  // si el creador se va antes de que entre nadie, desaparece
  const L4 = await conectar(PUERTO); await L4.emit("crear", { color: "azar", publica: true });
  lr = await L2.emit("listar", {}); ok(lr.partidas.length === 1, "la nueva aparece");
  L4.cerrar(); await dormir(100);
  lr = await L2.emit("listar", {}); ok(lr.partidas.length === 0, "sin creador conectado desaparece de la lista");
  // --- límite de creación
  let limitado = false;
  for (let i = 0; i < 40; i++) { const t = await A3.emit("crear", { color: "azar" }); if (!t.ok) { limitado = true; break; } }
  ok(limitado, "límite de creación de salas");
  console.log(`${pruebas} comprobaciones, ${fallos} fallos`);
  proc.kill("SIGKILL"); process.exit(fallos ? 1 : 0);
}
main().catch(e => { console.error(e); if (proc) proc.kill("SIGKILL"); process.exit(1); });
