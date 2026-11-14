// EG Remoto - EMAGIAKU OS online (il sistema che gira su Hugging Face, senza PC).
// Schermo via noVNC (MPL-2.0, cartella novnc/) dentro un WebSocket protetto: il primo messaggio e' un JWT
// dell'Account EMAGIAKU, il cancello (cloud/gate.py) lo controlla prima di far passare lo schermo.
import RFB from "./novnc/core/rfb.js";
import keysyms from "./novnc/core/input/keysymdef.js";

const K = { Enter: 0xff0d, Backspace: 0xff08, Tab: 0xff09, Escape: 0xff1b, Delete: 0xffff, Home: 0xff50, End: 0xff57,
  ArrowLeft: 0xff51, ArrowUp: 0xff52, ArrowRight: 0xff53, ArrowDown: 0xff54, PageUp: 0xff55, PageDown: 0xff56,
  Super: 0xffeb, Control: 0xffe3, Alt: 0xffe9, Shift: 0xffe1, Meta: 0xffeb };
for (let i = 1; i <= 12; i++) K["F" + i] = 0xffbd + i;
// codice fisico del tasto (come una tastiera vera): senza, lo schermo virtuale crea tasti "finti"
// e KDE non riconosce Super/Alt/Ctrl come modificatori (niente menu EG con il tasto Super)
const CODE = { Super: "MetaLeft", Meta: "MetaLeft", Control: "ControlLeft", Alt: "AltLeft", Shift: "ShiftLeft",
  Enter: "Enter", Backspace: "Backspace", Tab: "Tab", Escape: "Escape", Delete: "Delete", Home: "Home", End: "End",
  ArrowLeft: "ArrowLeft", ArrowUp: "ArrowUp", ArrowRight: "ArrowRight", ArrowDown: "ArrowDown",
  PageUp: "PageUp", PageDown: "PageDown" };
for (let i = 1; i <= 12; i++) CODE["F" + i] = "F" + i;

let rfb = null, sock = null, renew = null;

function keysymOf(k) {
  if (K[k]) return K[k];
  const cp = k.codePointAt(0);
  return keysyms.lookup(cp);
}

function tap(sym, code) { rfb.sendKey(sym, code || null, true); rfb.sendKey(sym, code || null, false); }

const EGCloud = {
  // entry: { name, ws, stato }; jwt: stringa; ui: { screen, status(text), ended(reason) }
  connect(entry, jwt, ui) {
    EGCloud.stop();
    let ok = false;
    sock = new WebSocket(entry.ws, "binary");
    sock.binaryType = "arraybuffer";
    sock.onopen = () => sock.send(JSON.stringify({ jwt }));
    sock.onmessage = (ev) => {
      if (ok || typeof ev.data !== "string") return;
      let r = {};
      try { r = JSON.parse(ev.data); } catch (e) { /* sotto */ }
      if (!r.ok) { ui.ended(r.errore || "Accesso non riuscito."); EGCloud.stop(); return; }
      ok = true;
      // da qui il canale passa a noVNC (stesso giro dell'evento: nessun messaggio si perde)
      sock.onmessage = sock.onclose = sock.onerror = null;
      rfb = new RFB(ui.screen, sock, { shared: true });
      rfb.scaleViewport = true;
      rfb.resizeSession = false;
      rfb.focusOnClick = false;
      rfb.addEventListener("connect", () => ui.status(""));
      // l'account resta collegato anche dentro il sistema: il pass (JWT, 15 minuti) si rinnova ogni 10
      clearInterval(renew);
      renew = setInterval(async () => {
        try {
          const j = (await window.EG.call("POST", "/account/jwts", {})).jwt;
          if (sock && sock.readyState === 1) sock.send(JSON.stringify({ cmd: "jwt", jwt: j }));
        } catch (e) { /* riprovo al prossimo giro */ }
      }, 10 * 60 * 1000);
      rfb.addEventListener("disconnect", (e) => {
        const clean = e.detail && e.detail.clean;
        rfb = null; sock = null;
        ui.ended(clean ? "" : "EMAGIAKU OS online si e' scollegato.");
      });
    };
    sock.onerror = () => { if (!ok) ui.ended("EMAGIAKU OS online non risponde: forse si sta ancora svegliando, riprova tra un minuto."); };
    sock.onclose = () => { if (!ok) ui.ended(""); };
  },
  active() { return !!rfb; },
  // comandi al cancello (testo): per ora solo il menu EG
  menu() { if (rfb && sock && sock.readyState === 1) sock.send(JSON.stringify({ cmd: "menu" })); },
  text(s) { if (!rfb) return; for (const ch of s) { if (ch === "\n") tap(K.Enter); else tap(keysymOf(ch)); } },
  key(k, mods) {
    if (!rfb) return;
    const m = (mods || []).filter((x) => K[x]);
    m.forEach((x) => rfb.sendKey(K[x], CODE[x], true));
    tap(keysymOf(k), CODE[k]);
    m.reverse().forEach((x) => rfb.sendKey(K[x], CODE[x], false));
  },
  stop() {
    clearInterval(renew);
    try { if (rfb) rfb.disconnect(); } catch (e) { /* gia' chiuso */ }
    try { if (sock && sock.readyState <= 1) sock.close(); } catch (e) { /* gia' chiuso */ }
    rfb = null; sock = null;
  },
};
window.EGCloud = EGCloud;
window.dispatchEvent(new Event("egcloud-ready"));
