// Simulador mínimo de socket.io (servidor + cliente) sobre SSE/POST, SOLO para probar sin npm.
const crypto = require("crypto");
const CLIENTE = `
(function(){
  window.io = function(url, opts){
    url = url || "";
    const handlers = {}; let es = null, sid = null, conectado = false, cola = [], acks = {}, nack = 0, cadena = Promise.resolve(), cerrado = false;
    const sock = {
      connected: false,
      on(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); return sock; },
      emit(ev, ...args){
        let cb = null; if (typeof args[args.length-1] === "function") cb = args.pop();
        const m = { ev, args, ack: null };
        if (cb) { m.ack = ++nack; acks[m.ack] = cb; }
        if (conectado) enviar(m); else cola.push(m);
        return sock;
      },
      disconnect(){ cerrado = true; if (es) es.close(); }
    };
    function disparar(ev, ...a){ (handlers[ev] || []).forEach(f => f(...a)); }
    function enviar(m){
      const s = sid;
      cadena = cadena.then(() => fetch(url + "/socket.io/send?sid=" + s, { method: "POST", body: JSON.stringify(m) }).catch(() => {}));
    }
    function abrir(){
      if (cerrado) return;
      es = new EventSource(url + "/socket.io/stream");
      es.onmessage = e => {
        const d = JSON.parse(e.data);
        if (d.t === "hello") { sid = d.sid; conectado = true; sock.connected = true; disparar("connect"); const c = cola; cola = []; c.forEach(enviar); }
        else if (d.t === "ev") disparar(d.ev, ...d.args);
        else if (d.t === "ack") { const f = acks[d.id]; delete acks[d.id]; if (f) f(...d.args); }
      };
      es.onerror = () => {
        es.close();
        if (conectado) { conectado = false; sock.connected = false; disparar("disconnect"); } else disparar("connect_error", new Error("x"));
        setTimeout(abrir, 300);
      };
    }
    window.__sockTest = { cortar(){ if (es) { es.close(); } conectado = false; sock.connected = false; disparar("disconnect"); setTimeout(abrir, 1500); } };
    abrir();
    return sock;
  };
})();`;

class Sock {
  constructor(io, sid, res, req) {
    this.io = io; this.id = sid; this.res = res; this.h = {}; this.rooms = new Set([sid]);
    this.handshake = { headers: req.headers, address: req.socket.remoteAddress };
  }
  on(ev, fn) { this.h[ev] = fn; return this; }
  emit(ev, ...args) { this._send({ t: "ev", ev, args }); return this; }
  _send(o) { try { this.res.write("data: " + JSON.stringify(o) + "\n\n"); } catch (e) {} }
  join(r) { this.rooms.add(r); }
  leave(r) { this.rooms.delete(r); }
}
class Server {
  constructor(http, opts) {
    this.socks = new Map(); this.conn = null;
    this.sockets = { sockets: this.socks };
    const orig = http.listeners("request"); http.removeAllListeners("request");
    http.on("request", (req, res) => {
      if (!req.url.startsWith("/socket.io/")) return orig.forEach(f => f(req, res));
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
      if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
      if (req.url.startsWith("/socket.io/socket.io.js")) { res.writeHead(200, Object.assign({ "Content-Type": "text/javascript" }, cors)); return res.end(CLIENTE); }
      if (req.url.startsWith("/socket.io/stream")) {
        res.writeHead(200, Object.assign({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }, cors));
        const sid = crypto.randomBytes(6).toString("hex"); const s = new Sock(this, sid, res, req);
        this.socks.set(sid, s);
        s._send({ t: "hello", sid });
        if (this.conn) this.conn(s);
        req.on("close", () => { this.socks.delete(sid); if (s.h.disconnect) s.h.disconnect(); });
        return;
      }
      if (req.url.startsWith("/socket.io/send")) {
        const sid = new URL(req.url, "http://x").searchParams.get("sid"); const s = this.socks.get(sid);
        let body = ""; req.on("data", c => body += c);
        req.on("end", () => {
          res.writeHead(200, cors); res.end("{}");
          if (!s) return; let m; try { m = JSON.parse(body); } catch (e) { return; }
          const f = s.h[m.ev]; if (!f) return;
          const args = m.args.slice();
          if (m.ack) args.push((...r) => s._send({ t: "ack", id: m.ack, args: r }));
          f(...args);
        });
        return;
      }
      res.writeHead(404); res.end();
    });
  }
  on(ev, fn) { if (ev === "connection") this.conn = fn; return this; }
  to(room) { return { emit: (ev, ...args) => { for (const s of this.socks.values()) if (s.rooms.has(room)) s.emit(ev, ...args); } }; }
}
module.exports = { Server };
