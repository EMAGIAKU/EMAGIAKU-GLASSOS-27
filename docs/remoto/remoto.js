// EG Remoto - web app: usa il tuo PC EMAGIAKU da telefono, tablet o Meta Quest.
// Il PC fa l'offerta WebRTC (schermo H.264 + canale "input"), questa pagina risponde.
"use strict";
const T_DEV = "/tablesdb/emagiaku/tables/devices/rows";
const T_SIG = "/tablesdb/emagiaku/tables/signals/rows";
const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
let ME = null, PC = null, DC = null, CUR = null, rightNext = false;

const q = (method, attr, values) => "queries[]=" + encodeURIComponent(JSON.stringify({ method, attribute: attr, values }));
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
const perms = () => ['read("user:' + ME.$id + '")', 'update("user:' + ME.$id + '")', 'delete("user:' + ME.$id + '")'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function view(which) {
  ["login", "signup", "verify", "mfa", "devices"].forEach((s) => EG.show(s, s === which));
  showInstall(which === "devices");
}

// ------------------------------------------------------------- accesso
async function start() {
  try {
    ME = await EG.call("GET", "/account");
    await loadDevices();
  } catch (e) {
    if (e.type === "user_more_factors_required") view("mfa");
    else view("login");
  }
}

async function loginPassword(btn) {
  EG.msg("");
  EG.busy(btn, true);
  try {
    await EG.logoutLocal();
    await EG.call("POST", "/account/sessions/email", { email: EG.$("email").value.trim(), password: EG.$("pw").value });
    EG.$("pw").value = "";
    await start();
  } catch (e) {
    EG.msg(EG.niceError(e), "bad");
  } finally { EG.busy(btn, false); }
}

async function loginPasskey(btn) {
  EG.msg("");
  EG.busy(btn, true, "Sblocca il telefono...");
  try {
    await EG.logoutLocal();
    const tok = await EG.passkeyToken();
    await EG.call("POST", "/account/sessions/token", { userId: tok.userId, secret: tok.secret });
    await start();
  } catch (e) {
    EG.msg(EG.niceError(e) + (e && e.name === "NotAllowedError" ?
      " Crea la passkey da EG Impostazioni > Account sul PC." : ""), "bad");
  } finally { EG.busy(btn, false); }
}

// stesse regole del PC (egcloud.password_problem); il server fa anche i suoi controlli
const COMMON_PW = ["password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123",
  "qwertyuiop", "abc12345", "abcd1234", "iloveyou1", "admin123", "welcome1", "passw0rd", "11111111", "00000000",
  "ciao1234", "amore123", "juventus1", "napoli123", "emagiaku1", "emagiaku123"];
function passwordProblem(pw, email) {
  if (pw.length < 8) return "La password deve avere almeno 8 caratteri.";
  if (!/\p{L}/u.test(pw) || !/\d/.test(pw)) return "La password deve avere sia lettere sia numeri.";
  if (COMMON_PW.includes(pw.toLowerCase()) || new Set(pw).size <= 3) return "Password troppo facile da indovinare: scegline un'altra.";
  const user = (email.split("@")[0] || "").toLowerCase();
  if (user.length >= 4 && pw.toLowerCase().includes(user)) return "La password non deve contenere il tuo indirizzo email.";
  return "";
}

async function signUp(btn) {
  EG.msg("");
  const name = EG.$("s_name").value.trim(), email = EG.$("s_email").value.trim();
  const pw = EG.$("s_pw").value, pw2 = EG.$("s_pw2").value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { EG.msg("Scrivi un indirizzo email valido.", "bad"); return; }
  const bad = passwordProblem(pw, email);
  if (bad) { EG.msg(bad, "bad"); return; }
  if (pw !== pw2) { EG.msg("Le due password non sono uguali.", "bad"); return; }
  EG.busy(btn, true, "Creo l'account...");
  try {
    await EG.logoutLocal();
    const body = { userId: "unique()", email, password: pw };
    if (name) body.name = name;
    await EG.call("POST", "/account", body);
    await EG.call("POST", "/account/sessions/email", { email, password: pw });
    ["s_pw", "s_pw2"].forEach((id) => { EG.$(id).value = ""; });
    ME = await EG.call("GET", "/account");
    await sendVerify();
  } catch (e) {
    EG.msg(EG.niceError(e), "bad");
  } finally { EG.busy(btn, false); }
}

async function sendVerify() {
  view("verify");
  EG.$("v_text").textContent = "Ti abbiamo mandato un codice di 6 cifre a " + ME.email + ". Guarda anche nello spam.";
  try {
    await EG.call("POST", "/account/verifications/email/otp", {});
  } catch (e) {
    EG.msg(EG.niceError(e), "bad");
  }
}

async function confirmVerify(btn) {
  EG.msg("");
  const code = EG.$("v_code").value.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) { EG.msg("Il codice ha 6 cifre.", "bad"); return; }
  EG.busy(btn, true);
  try {
    await EG.call("PUT", "/account/verifications/email/otp", { userId: ME.$id, secret: code });
    EG.$("v_code").value = "";
    EG.msg("Email confermata. Account pronto!", "ok");
    await start();
  } catch (e) {
    EG.msg(EG.niceError(e), "bad");
  } finally { EG.busy(btn, false); }
}

async function finishMfa(btn) {
  EG.busy(btn, true);
  try {
    const code = EG.$("code").value.replace(/\s/g, "");
    const ch = await EG.call("POST", "/account/mfa/challenge", { factor: /^\d{6}$/.test(code) ? "totp" : "recoveryCode" });
    await EG.call("PUT", "/account/mfa/challenge", { challengeId: ch.$id, otp: code });
    EG.$("code").value = "";
    await start();
  } catch (e) {
    EG.msg(EG.niceError(e), "bad");
  } finally { EG.busy(btn, false); }
}

// ------------------------------------------------------------- i miei PC
async function loadDevices() {
  view("devices");
  EG.$("who").textContent = "Account: " + ME.email;
  const list = EG.$("list");
  list.textContent = "Carico...";
  let rows = [];
  try {
    rows = ((await EG.call("GET", T_DEV)).rows || []).sort((a, b) => (b.seen || 0) - (a.seen || 0));
  } catch (e) {
    list.textContent = "";
    return EG.msg(EG.niceError(e), "bad");
  }
  list.textContent = "";
  if (!rows.length) {
    list.innerHTML = '<p class="small">Nessun PC collegato a questo account.</p>';
    return;
  }
  const now = Date.now() / 1000;
  rows.forEach((d) => {
    const online = d.status !== "offline" && now - (d.seen || 0) < 300;
    const div = document.createElement("div");
    div.className = "dev";
    div.innerHTML = '<div class="dot"></div><div class="info"><b></b><span></span></div><button>Collega</button>';
    div.querySelector(".dot").classList.add(online ? (d.status === "busy" ? "busy" : "on") : "off");
    div.querySelector("b").textContent = d.name || "PC";
    div.querySelector("span").textContent = online ? (d.status === "busy" ? "in uso" : "acceso") :
      "spento o non raggiungibile";
    const b = div.querySelector("button");
    b.disabled = !online;
    b.onclick = () => connect(d);
    list.appendChild(div);
  });
}

// ------------------------------------------------------------- collegamento
// formato video: H.264 (leggero per il PC); se il video non arriva si passa da soli a VP8 e lo si ricorda
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// su iPhone/iPad si parte da VP8 (provato: funziona sempre); altrove H.264, che pesa meno sul PC
const DEFAULT_CODEC = IS_IOS ? "vp8" : "h264";
function getCodec() { try { return localStorage.getItem("eg_codec") || DEFAULT_CODEC; } catch (e) { return DEFAULT_CODEC; } }
function setCodec(c) { try { localStorage.setItem("eg_codec", c); } catch (e) { /* niente */ } }
let videoWatch = null;

function watchVideo(dev, codec) {
  clearTimeout(videoWatch);
  videoWatch = setTimeout(() => {
    const v = EG.$("video");
    if (!CUR || CUR.dev !== dev || v.videoWidth > 0) return;
    if (codec === "h264") {
      setCodec("vp8");
      CUR.retry = true;
      disconnect("");
      setTimeout(() => connect(dev, "Il video non arrivava: riprovo con un altro formato..."), 800);
    } else {
      setStatus("Il PC e' collegato ma il video non arriva. Aggiorna il PC (EG Update) e riprova.");
    }
  }, 7000);
}

async function connect(dev, note) {
  EG.msg("");
  const codec = getCodec();
  CUR = { dev, session: hex(16), rows: [], codec };
  EG.show("ui", false);
  EG.show("viewer", true);
  EG.$("video").srcObject = null;
  setStatus(note || ("Chiedo al PC \"" + (dev.name || "PC") + "\"..."));
  try {
    const req = { t: Math.floor(Date.now() / 1000), codec, maxw: IS_IOS ? 1280 : 1920 };
    await EG.call("POST", T_SIG, { rowId: hex(16), permissions: perms(),
      data: { device: dev.$id, session: CUR.session, kind: "request", data: JSON.stringify(req) } });
    let offer = null;
    for (let i = 0; i < 40 && CUR && !offer; i++) {     // il PC controlla ogni 3 secondi
      await sleep(1000);
      const r = (await EG.call("GET", T_SIG + "?" + [q("equal", "device", [dev.$id]), q("equal", "session", [CUR.session]),
        q("equal", "kind", ["offer"])].join("&"))).rows || [];
      if (r.length) offer = JSON.parse(r[0].data);
    }
    if (!CUR) return;
    if (!offer) throw new Error("Il PC non risponde: e' acceso, con l'utente aperto e l'accesso remoto attivo?");
    setStatus("Collego...");
    PC = new RTCPeerConnection({ iceServers: STUN });
    PC.ontrack = (ev) => {
      const v = EG.$("video");
      if (ev.track.kind !== "video") return;
      v.srcObject = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
      v.play().catch(() => {});
    };
    PC.ondatachannel = (ev) => { DC = ev.channel; DC.onopen = () => setStatus(""); };
    PC.onconnectionstatechange = () => {
      const s = PC && PC.connectionState;
      if (s === "connected") { setStatus(""); if (CUR) watchVideo(CUR.dev, CUR.codec); }
      if (s === "failed") disconnect("Collegamento non riuscito: la tua rete potrebbe bloccare il collegamento diretto.");
      if (s === "closed" || s === "disconnected") disconnect("Il PC si e' scollegato.");
    };
    await PC.setRemoteDescription(offer);
    await PC.setLocalDescription(await PC.createAnswer());
    await iceDone(PC, 4000);
    await EG.call("POST", T_SIG, { rowId: hex(16), permissions: perms(),
      data: { device: dev.$id, session: CUR.session, kind: "answer", data: JSON.stringify({ type: "answer", sdp: PC.localDescription.sdp }) } });
    setStatus("Collego...");
  } catch (e) {
    disconnect(EG.niceError(e));
  }
}

function iceDone(pc, ms) {
  return new Promise((ok) => {
    if (pc.iceGatheringState === "complete") return ok();
    const t = setTimeout(ok, ms);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(t); ok(); }
    });
  });
}

function disconnect(reason) {
  clearTimeout(videoWatch);
  if (PC) { try { PC.close(); } catch (e) { /* gia' chiuso */ } }
  PC = null; DC = null;
  const c = CUR; CUR = null;
  if (c) cleanup(c);
  EG.show("viewer", false);
  EG.show("ui", true);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (reason) EG.msg(reason, "bad");
  if (ME) loadDevices();
}

async function cleanup(c) {
  try {
    const r = (await EG.call("GET", T_SIG + "?" + [q("equal", "device", [c.dev.$id]), q("equal", "session", [c.session])].join("&"))).rows || [];
    for (const row of r) { try { await EG.call("DELETE", T_SIG + "/" + row.$id); } catch (e) { /* niente */ } }
  } catch (e) { /* niente */ }
}

function setStatus(t) { EG.$("status").textContent = t; EG.$("status").hidden = !t; }

// ------------------------------------------------------------- comandi
function send(o) { if (DC && DC.readyState === "open") DC.send(JSON.stringify(o)); }

function videoPoint(clientX, clientY) {
  // coordinate 0..1 dentro l'immagine del PC (tenendo conto delle bande nere)
  const v = EG.$("video"), r = v.getBoundingClientRect();
  const vw = v.videoWidth || 16, vh = v.videoHeight || 9;
  const scale = Math.min(r.width / vw, r.height / vh);
  const w = vw * scale, h = vh * scale, ox = r.left + (r.width - w) / 2, oy = r.top + (r.height - h) / 2;
  return { x: Math.min(1, Math.max(0, (clientX - ox) / w)), y: Math.min(1, Math.max(0, (clientY - oy) / h)) };
}

let lastMove = 0;
function move(p) {
  const now = performance.now();
  if (now - lastMove < 16) return;     // ~60 al secondo
  lastMove = now;
  send({ t: "move", x: p.x, y: p.y });
}

function setupInput() {
  const v = EG.$("video");
  // mouse (PC, Quest con il controller)
  v.addEventListener("mousemove", (e) => move(videoPoint(e.clientX, e.clientY)));
  v.addEventListener("mousedown", (e) => { e.preventDefault(); const p = videoPoint(e.clientX, e.clientY); send({ t: "down", b: e.button === 2 ? 3 : e.button === 1 ? 2 : 1, x: p.x, y: p.y }); });
  v.addEventListener("mouseup", (e) => { const p = videoPoint(e.clientX, e.clientY); send({ t: "up", b: e.button === 2 ? 3 : e.button === 1 ? 2 : 1, x: p.x, y: p.y }); });
  v.addEventListener("contextmenu", (e) => e.preventDefault());
  v.addEventListener("wheel", (e) => { e.preventDefault(); send({ t: "wheel", dy: Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / 60)) }); }, { passive: false });
  // tocco: tap = clic, trascina = sposta il mouse, due dita = scorri, tieni premuto = tasto destro
  let t0 = null, longT = null, dragging = false, lastY2 = null;
  v.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (e.touches.length === 2) { lastY2 = (e.touches[0].clientY + e.touches[1].clientY) / 2; clearTimeout(longT); return; }
    const t = e.touches[0], p = videoPoint(t.clientX, t.clientY);
    t0 = { x: t.clientX, y: t.clientY, time: Date.now(), p };
    dragging = false;
    send({ t: "move", x: p.x, y: p.y });
    longT = setTimeout(() => { send({ t: "click", b: 3, x: p.x, y: p.y }); t0 = null; if (navigator.vibrate) navigator.vibrate(30); }, 650);
  }, { passive: false });
  v.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (e.touches.length === 2 && lastY2 !== null) {
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2, d = lastY2 - y;
      if (Math.abs(d) > 25) { send({ t: "wheel", dy: d > 0 ? 1 : -1 }); lastY2 = y; }
      return;
    }
    if (!t0) return;
    const t = e.touches[0];
    if (!dragging && Math.hypot(t.clientX - t0.x, t.clientY - t0.y) > 12) {
      clearTimeout(longT);
      dragging = true;
      send({ t: "down", b: 1, x: t0.p.x, y: t0.p.y });     // trascinare = tenere premuto il tasto sinistro
    }
    if (dragging) move(videoPoint(t.clientX, t.clientY));
  }, { passive: false });
  v.addEventListener("touchend", (e) => {
    e.preventDefault();
    clearTimeout(longT);
    if (e.touches.length) return;
    lastY2 = null;
    if (!t0) return;
    const t = e.changedTouches[0], p = videoPoint(t.clientX, t.clientY);
    if (dragging) send({ t: "up", b: 1, x: p.x, y: p.y });
    else { send({ t: "click", b: rightNext ? 3 : 1, x: t0.p.x, y: t0.p.y }); setRight(false); }
    t0 = null; dragging = false;
  }, { passive: false });
  // tastiera
  const kbd = EG.$("kbd");
  kbd.addEventListener("input", () => { if (kbd.value) { send({ t: "text", s: kbd.value }); kbd.value = ""; } });
  const keys = { Enter: 1, Backspace: 1, Tab: 1, Escape: 1, Delete: 1, ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
                 Home: 1, End: 1, PageUp: 1, PageDown: 1, F1: 1, F2: 1, F3: 1, F4: 1, F5: 1, F6: 1, F7: 1, F8: 1, F9: 1, F10: 1, F11: 1, F12: 1 };
  const onKey = (e) => {
    const mods = [e.ctrlKey && "Control", e.altKey && "Alt", e.metaKey && "Meta"].filter(Boolean);
    if (keys[e.key] || (mods.length && e.key.length === 1)) {
      e.preventDefault();
      send({ t: "key", k: e.key.length === 1 ? e.key.toLowerCase() : e.key, mods: e.shiftKey && mods.length ? mods.concat("Shift") : mods });
    }
  };
  kbd.addEventListener("keydown", onKey);
  document.addEventListener("keydown", (e) => {
    if (EG.$("viewer").hidden || document.activeElement === kbd) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); send({ t: "text", s: e.key }); }
    else onKey(e);
  });
  // barra
  EG.$("bar").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "kbd") { kbd.focus(); }
    else if (a === "right") setRight(!rightNext);
    else if (a === "esc") send({ t: "key", k: "Escape", mods: [] });
    else if (a === "win") send({ t: "key", k: "Super", mods: [] });
    else if (a === "full") { const el = EG.$("viewer"); (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen()).catch(() => {}); }
    else if (a === "quit") disconnect("");
  });
}
function setRight(on) { rightNext = on; EG.$("bar").querySelector('[data-act="right"]').classList.toggle("on", on); }

// ------------------------------------------------------------- installazione (PWA)
let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; showInstall(true); });
function showInstall(on) {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone || !on) { EG.show("install", false); return; }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), quest = /OculusBrowser|Quest/.test(navigator.userAgent);
  EG.$("install_text").textContent = installEvt ? "Installala: avrai la sua icona e si apre a schermo intero." :
    ios ? "Su iPhone: tocca Condividi in Safari e poi \"Aggiungi a schermata Home\"." :
    quest ? "Sul Quest: nel browser apri il menu e scegli Installa." :
    "Dal menu del browser scegli \"Installa app\" o \"Aggiungi a schermata Home\".";
  EG.show("b_install", !!installEvt);
  EG.show("install", true);
}
EG.$("b_install").onclick = async () => { if (installEvt) { installEvt.prompt(); installEvt = null; showInstall(true); } };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// ------------------------------------------------------------- avvio
EG.$("b_login").onclick = (e) => loginPassword(e.target);
EG.$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") loginPassword(EG.$("b_login")); });
EG.$("b_passkey").onclick = (e) => loginPasskey(e.target);
EG.$("b_go_signup").onclick = () => { EG.msg(""); EG.$("s_email").value = EG.$("email").value; view("signup"); };
EG.$("b_go_login").onclick = () => { EG.msg(""); view("login"); };
EG.$("b_signup").onclick = (e) => signUp(e.target);
EG.$("s_pw2").addEventListener("keydown", (e) => { if (e.key === "Enter") signUp(EG.$("b_signup")); });
EG.$("b_verify").onclick = (e) => confirmVerify(e.target);
EG.$("v_code").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmVerify(EG.$("b_verify")); });
EG.$("b_verify_again").onclick = async (e) => { EG.busy(e.target, true); await sendVerify(); EG.msg("Codice mandato di nuovo.", "ok"); EG.busy(e.target, false); };
EG.$("b_verify_later").onclick = () => { EG.msg(""); start(); };
EG.$("b_mfa").onclick = (e) => finishMfa(e.target);
EG.$("b_mfa_out").onclick = async () => { await EG.logoutLocal(); view("login"); };
EG.$("b_reload").onclick = () => loadDevices();
EG.$("b_out").onclick = async () => { await EG.logoutLocal(); ME = null; view("login"); };
EG.show("b_passkey", EG.supportsPasskey());
setupInput();
start();
