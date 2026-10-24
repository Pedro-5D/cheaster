const { spawn } = require("child_process"); const path = require("path"), fs = require("fs"), os = require("os");
const { chromium } = require("playwright");
const SP = __dirname, PUERTO = 3196, URL = "http://127.0.0.1:" + PUERTO + "/";
(async () => {
  const proc = spawn("node", ["/home/claude/cheaster/server/server.js"], { env: Object.assign({}, process.env, { PORT: PUERTO, DATOS: fs.mkdtempSync(path.join(os.tmpdir(), "chs-")), NODE_PATH: path.join(SP, "fake/node_modules") }), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 700));
  const b = await chromium.launch(); const ctx = await b.newContext(); // UN solo navegador, dos pestañas
  const t1 = await ctx.newPage(), t2 = await ctx.newPage(); let fallos = 0;
  const ok = (c, m) => { console.log(c ? "ok  " : "FALLO:", m); if (!c) fallos++; };
  await t1.goto(URL); await t1.click("#m-online"); await t1.click("#on-crear"); await t1.waitForSelector("#on-cod:not(:empty)");
  const cod = await t1.locator("#on-cod").innerText();
  await t2.goto(URL + "?sala=" + cod);
  await t2.waitForFunction(() => /Rival conectado/.test(document.getElementById("on-rival").textContent));
  await t1.waitForFunction(() => /Rival conectado/.test(document.getElementById("on-rival").textContent));
  ok(true, "la segunda pestaña entra como rival (no echa a la primera)");
  ok(await t1.evaluate(() => window.__cheaster.sesion.color) !== await t2.evaluate(() => window.__cheaster.sesion.color), "colores distintos");
  await t1.reload(); await t1.waitForFunction(() => window.__cheaster.sesion && window.__cheaster.sesion.hayRival);
  ok(true, "al recargar una pestaña vuelve a su partida");
  // una pestaña nueva sin enlace no se mete en la partida de otra
  const t3 = await ctx.newPage(); await t3.goto(URL);
  ok(await t3.evaluate(() => !window.__cheaster.sesion) && await t3.locator("#m-online").isVisible(), "pestaña nueva: juego normal, sin sesión online");
  await b.close(); proc.kill("SIGKILL"); process.exit(fallos ? 1 : 0);
})();
