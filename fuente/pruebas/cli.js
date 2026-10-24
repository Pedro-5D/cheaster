// Cliente de pruebas para el simulador (SSE + POST) desde Node
const http = require("http");
function conectar(puerto) {
  return new Promise((ok) => {
    const c = { evs: [], h: {}, acks: {}, n: 0, sid: null, cerrado: false };
    const req = http.get({ port: puerto, path: "/socket.io/stream", host: "127.0.0.1" }, res => {
      let buf = "";
      res.on("data", d => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const bloque = buf.slice(0, i); buf = buf.slice(i + 2);
          const m = JSON.parse(bloque.replace(/^data: /, ""));
          if (m.t === "hello") { c.sid = m.sid; ok(c); }
          else if (m.t === "ev") { c.evs.push({ ev: m.ev, a: m.args }); (c.h[m.ev] || []).forEach(f => f(...m.args)); }
          else if (m.t === "ack") { const f = c.acks[m.id]; delete c.acks[m.id]; f(...m.args); }
        }
      });
    });
    c.req = req;
    c.emit = (ev, ...args) => new Promise(res => {
      const m = { ev, args, ack: ++c.n }; c.acks[m.ack] = r => res(r);
      const rq = http.request({ port: puerto, host: "127.0.0.1", path: "/socket.io/send?sid=" + c.sid, method: "POST" }); rq.end(JSON.stringify(m));
    });
    c.on = (ev, f) => { (c.h[ev] = c.h[ev] || []).push(f); };
    c.ultimo = ev => { for (let i = c.evs.length - 1; i >= 0; i--) if (c.evs[i].ev === ev) return c.evs[i].a[0]; return null; };
    c.cerrar = () => { c.req.destroy(); };
  });
}
module.exports = { conectar };
