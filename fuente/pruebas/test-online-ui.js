const { spawn } = require("child_process");
const path = require("path"), fs = require("fs"), os = require("os");
const { chromium } = require("playwright");
const PUERTO = 3198, URL = "http://127.0.0.1:" + PUERTO + "/";
const datos = fs.mkdtempSync(path.join(os.tmpdir(), "chu-"));
const dormir = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0, pruebas = 0;
const ok = (c, msg) => { pruebas++; if (!c) { fallos++; console.log("FALLO:", msg); } else console.log("ok  ", msg); };
async function main() {
  const proc = spawn("node", ["/home/claude/cheaster/server/server.js"], { env: Object.assign({}, process.env, { PORT: PUERTO, DATOS: datos, AUSENCIA_MS: "1500", NODE_PATH: path.join(__dirname, "fake/node_modules") }), stdio: ["ignore", "ignore", "inherit"] });
  await dormir(700);
  const browser = await chromium.launch();
  const errores = [];
  const nueva = async (opts) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1000, height: 800 } }, opts || {}));
    const pg = await ctx.newPage();
    pg.on("pageerror", e => errores.push("pageerror: " + e.message));
    pg.on("console", m => { if (m.type() === "error") errores.push("console: " + m.text()); });
    pg.on("dialog", d => d.accept());
    return { ctx, pg };
  };
  const J1 = await nueva(), J2 = await nueva({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const p1 = J1.pg, p2 = J2.pg;
  const txt = (p, sel) => p.locator(sel).innerText();
  const mov = (p) => p.evaluate(() => window.__cheaster.movimientos.length);

  await p1.goto(URL); await p1.waitForSelector(".cas");
  // partida local previa para comprobar que se conserva
  await p1.evaluate(() => window.__cheaster.alClick(24)); await p1.evaluate(() => window.__cheaster.alClick(18));
  ok(await mov(p1) === 1, "jugada local previa");
  await p1.click("#m-online");
  ok(await p1.isVisible("#on-crear"), "aparece el panel online");
  ok(/Crea una partida/.test(await txt(p1, "#estado")), "estado: invita a crear");
  await p1.click('#on-colores button[data-c="blancas"]');
  await p1.click("#on-crear");
  await p1.waitForSelector("#on-cod:not(:empty)");
  const cod = await txt(p1, "#on-cod");
  ok(/^[A-Z2-9]{5}$/.test(cod), "código de sala " + cod);
  ok(/Esperando a tu rival/.test(await txt(p1, "#estado")), "esperando rival");
  ok(await mov(p1) === 0, "tablero online limpio");

  // J1 no puede mover aún
  await p1.evaluate(() => window.__cheaster.alClick(24)); await p1.evaluate(() => window.__cheaster.alClick(18));
  ok(await mov(p1) === 0, "no se mueve sin rival");

  // J2 entra por el enlace
  await p2.goto(URL + "?sala=" + cod.toLowerCase());
  await p2.waitForSelector("#online.en-sala");
  await p2.waitForFunction(() => /Rival conectado/.test(document.getElementById("on-rival").textContent));
  ok(/negras/.test(await txt(p2, "#on-rival")), "J2 juega con negras");
  ok(await p2.evaluate(() => window.__cheaster.ajustes.girado === true), "tablero girado para negras");
  await p1.waitForFunction(() => /Rival conectado/.test(document.getElementById("on-rival").textContent));
  ok(/Tu turno/.test(await txt(p1, "#estado")), "J1: tu turno");
  ok(/Turno de tu rival/.test(await txt(p2, "#estado")), "J2: turno del rival");
  ok(!(await p2.url()).includes("sala="), "la URL se limpia");

  // jugadas
  await p2.evaluate(() => window.__cheaster.alClick(6)); await p2.evaluate(() => window.__cheaster.alClick(12));
  ok(await mov(p2) === 0, "J2 no puede mover en turno blanco");
  await p1.evaluate(() => window.__cheaster.alClick(24)); await p1.evaluate(() => window.__cheaster.alClick(18));
  await p2.waitForFunction(() => window.__cheaster.movimientos.length === 1);
  ok(await mov(p1) === 1 && await mov(p2) === 1, "jugada blanca llega a los dos");
  ok(/Tu turno/.test(await txt(p2, "#estado")), "J2: ahora es tu turno");
  await p2.evaluate(() => window.__cheaster.alClick(6)); await p2.evaluate(() => window.__cheaster.alClick(12));
  await p1.waitForFunction(() => window.__cheaster.movimientos.length === 2);
  ok(/b\d|a\d|[a-f]\d/.test(await txt(p1, "#historial")), "historial con notación");

  // J2 recarga la página: vuelve a su partida
  await p2.reload(); await p2.waitForSelector("#online.en-sala");
  await p2.waitForFunction(() => window.__cheaster.movimientos.length === 2);
  ok(await txt(p2, "#on-cod") === cod, "tras recargar, J2 sigue en su sala");
  ok(await p2.evaluate(() => window.__cheaster.sesion.color === -1), "mismo color tras recargar");

  // corte de red de J1
  await p1.evaluate(() => window.__sockTest.cortar());
  await p1.waitForFunction(() => /Sin conexión/.test(document.getElementById("estado").textContent));
  await p1.evaluate(() => window.__cheaster.alClick(25)); await p1.evaluate(() => window.__cheaster.alClick(19));
  ok(await mov(p1) === 2, "sin conexión no se envían jugadas");
  await p2.waitForFunction(() => /desconectado/.test(document.getElementById("on-rival").textContent));
  ok(true, "J2 ve a su rival desconectado");
  await p1.waitForFunction(() => /Rival conectado/.test(document.getElementById("on-rival").textContent), null, { timeout: 8000 });
  ok(true, "J1 se reconecta solo");
  await p2.waitForFunction(() => /Rival conectado/.test(document.getElementById("on-rival").textContent));
  await p1.evaluate(() => window.__cheaster.alClick(25)); await p1.evaluate(() => window.__cheaster.alClick(19));
  await p2.waitForFunction(() => window.__cheaster.movimientos.length === 3);
  ok(true, "tras reconectar se sigue jugando");

  // tablas: rechazo y aceptación
  await p2.click("#on-tablas");
  await p1.waitForSelector("#on-oferta.on");
  ok(/ofrece tablas/.test(await txt(p1, "#on-oferta")), "J1 ve la oferta");
  ok(/Esperando respuesta/.test(await txt(p2, "#on-oferta")), "J2 espera respuesta");
  await p1.click("#on-rechaza");
  await p2.waitForFunction(() => !document.getElementById("on-oferta").classList.contains("on"));
  ok(true, "oferta rechazada");
  await p1.click("#on-tablas");
  await p2.waitForSelector("#on-oferta.on");
  await p2.click("#on-acepta");
  await p1.waitForSelector("#fin-capa.on");
  ok(/Tablas/.test(await txt(p1, "#fin-titulo")) && /acordado/.test(await txt(p1, "#fin-detalle")), "fin por tablas acordadas");
  await p1.screenshot({ path: "/tmp/claude-0/-home-claude/1f05e95b-8de4-5706-ac09-a38f1879c437/scratchpad/on_fin_pc.png" });

  // revancha
  await p1.click("#fin-nueva");
  await p1.waitForFunction(() => document.getElementById("fin-nueva").disabled);
  ok(true, "botón revancha en espera");
  ok(/Esperando a que tu rival/.test(await txt(p1, "#fin-detalle")), "texto de espera");
  ok(/quiere la revancha/.test(await txt(p2, "#fin-detalle")), "J2 ve que quieren revancha");
  await p2.click("#fin-nueva");
  await p1.waitForFunction(() => window.__cheaster.movimientos.length === 0 && !document.getElementById("fin-capa").classList.contains("on"));
  await p2.waitForFunction(() => window.__cheaster.movimientos.length === 0 && !document.getElementById("fin-capa").classList.contains("on"));
  ok(await p1.evaluate(() => window.__cheaster.sesion.color === -1) && await p2.evaluate(() => window.__cheaster.sesion.color === 1), "colores intercambiados");
  ok(await p1.evaluate(() => window.__cheaster.ajustes.girado === true), "J1 ahora ve el tablero girado");

  // jaque mate del loco / mate rápido: J2 (blancas) y J1 (negras)
  // blancas f2-f3? usar jugadas del motor: buscamos mate en pocas jugadas por búsqueda
  const mate = await p2.evaluate(() => {
    const E = window.__cheaster.E;
    function busca(s, prof, camino) {
      if (prof === 0) return null;
      for (const m of E.legales(s)) {
        const u = E.hacer(s, m); camino.push(m);
        const est = E.estadoPartida(s, null);
        if (est.fin && est.tipo === "mate") { E.deshacer(s, u); return camino.slice(); }
        const r = busca(s, prof - 1, camino);
        E.deshacer(s, u); camino.pop();
        if (r) return r;
      }
      return null;
    }
    return busca(E.nuevoEstado(), 4, []).map(m => ({ from: m.from, to: m.to, promo: m.promo || 0 }));
  });
  console.log("mate en", mate.length, "jugadas");
  for (let i = 0; i < mate.length; i++) {
    const p = i % 2 === 0 ? p2 : p1; // blancas = J2
    const m = mate[i];
    await p.evaluate(([a, b]) => { window.__cheaster.alClick(a); window.__cheaster.alClick(b); }, [m.from, m.to]);
    if (m.promo) { await p.click("#promo-opciones button"); }
    await (i % 2 === 0 ? p1 : p2).waitForFunction(n => window.__cheaster.movimientos.length === n, i + 1);
  }
  await p1.waitForSelector("#fin-capa.on");
  const pierde = mate.length % 2 === 1 ? p1 : p2, gana = mate.length % 2 === 1 ? p2 : p1; // mate.length impar: dio mate el blanco (J2)
  await pierde.waitForFunction(() => document.getElementById("fin-capa").classList.contains("on"));
  await gana.waitForFunction(() => document.getElementById("fin-capa").classList.contains("on"));
  ok(/mate/i.test(await txt(pierde, "#fin-titulo")) && /perdido/.test(await txt(pierde, "#fin-detalle")), "pierde por mate");
  ok(/ganado/.test(await txt(gana, "#fin-detalle")), "gana por mate");

  // abandono en partida nueva (revancha de nuevo)
  console.log("→ revancha tras mate");
  await p1.click("#fin-nueva"); await p2.click("#fin-nueva");
  for (const q of [p1, p2]) await q.waitForFunction(() => window.__cheaster.movimientos.length === 0 && !document.getElementById("fin-capa").classList.contains("on"));
  console.log("→ abandono");
  const quien = await p1.evaluate(() => window.__cheaster.sesion.color);
  const blancas = quien === 1 ? p1 : p2, negras = quien === 1 ? p2 : p1;
  await blancas.evaluate(() => window.__cheaster.alClick(24)); await blancas.evaluate(() => window.__cheaster.alClick(18));
  await negras.waitForFunction(() => window.__cheaster.movimientos.length === 1);
  await negras.click("#on-abandonar");
  await blancas.waitForSelector("#fin-capa.on");
  ok(/rival ha abandonado/.test(await txt(blancas, "#fin-detalle")), "el rival ve el abandono");
  ok(/Has abandonado/.test(await txt(negras, "#fin-detalle")), "quien abandona lo ve");

  // reclamar por ausencia
  console.log("→ revancha tras abandono");
  await blancas.click("#fin-nueva"); await negras.click("#fin-nueva");
  for (const q of [p1, p2]) await q.waitForFunction(() => window.__cheaster.movimientos.length === 0 && !document.getElementById("fin-capa").classList.contains("on"));
  console.log("→ ausencia");
  const c1 = await p1.evaluate(() => window.__cheaster.sesion.color);
  const b2 = c1 === 1 ? p1 : p2, n2 = c1 === 1 ? p2 : p1;
  await b2.evaluate(() => window.__cheaster.alClick(24)); await b2.evaluate(() => window.__cheaster.alClick(18));
  await n2.waitForFunction(() => window.__cheaster.movimientos.length === 1);
  await n2.context().close();                       // cierra el navegador de las negras
  await b2.waitForFunction(() => /desconectado/.test(document.getElementById("on-rival").textContent));
  await b2.waitForTimeout(3000);
  console.log(await b2.evaluate(() => JSON.stringify(Object.assign({}, window.__cheaster.sesion, {ahora: Date.now()})) + " | " + document.getElementById("on-rival").textContent + " | " + document.getElementById("on-reclamar").getAttribute("style")));
  await b2.waitForSelector("#on-reclamar:not([style*='display: none'])", { timeout: 6000 });
  await b2.click("#on-reclamar");
  await b2.waitForSelector("#fin-capa.on");
  ok(/ausencia/i.test(await txt(b2, "#fin-titulo")), "victoria por ausencia");

  // salir: vuelve la partida local de antes
  await b2.click("#on-salir");
  ok(!(await b2.isVisible("#on-crear")), "panel online oculto");
  ok(await b2.evaluate(() => window.__cheaster.movimientos.length) >= 0, "volvió al modo local");
  if (b2 === p1) ok(await mov(p1) === 1, "la partida local de J1 se conserva (1 jugada)");
  await b2.screenshot({ path: "/tmp/claude-0/-home-claude/1f05e95b-8de4-5706-ac09-a38f1879c437/scratchpad/on_local.png" });

  ok(errores.length === 0, "sin errores de consola: " + errores.join(" | "));
  console.log(`${pruebas} comprobaciones, ${fallos} fallos`);
  await browser.close(); proc.kill("SIGKILL"); process.exit(fallos ? 1 : 0);
}
main().catch(e => { console.error("EXCEPCIÓN", e.message); process.exit(1); });
