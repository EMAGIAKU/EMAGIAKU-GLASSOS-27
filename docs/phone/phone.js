// EG GLASS PHONE - EMAGIAKU GLASS OS sul telefono, a tutto schermo, senza PC.
// Usa lo stesso sistema online di EG Remoto (../remoto/cloud.json + cloud.js con noVNC) e lo stesso Account EMAGIAKU.
"use strict";
let ME = null, SYS = null, OPEN = false;
// 27.27: con ?os=play e' "EG PLAY OS online" (app EG PLAY CLOUD): stesso sistema online, si apre EG PLAY a tutto schermo
// 27.30: lo stesso codice e' anche l'app EG CLOUD (../cloud/, <body data-app="cloud">): tutti i sistemi online in
// un'app sola, scegli EMAGIAKU GLASS OS o EG PLAY OS in alto (la scelta resta salvata su questo dispositivo).
const CLOUD = document.body.dataset.app === "cloud";
const APP = CLOUD ? "EG CLOUD" : "EG GLASS PHONE";
let PLAY = new URLSearchParams(location.search).get("os") === "play";
if (CLOUD && !new URLSearchParams(location.search).get("os")) {
  try { PLAY = localStorage.getItem("eg_cloud_os") === "play"; } catch (e) { /* niente memoria */ }
}
let NOME = "";
window.EGPhone = { setOS: (p) => setOS(p), open: () => { sessionStorage.removeItem("eg_phone_closed"); openOS(); },
                   isPlay: () => PLAY, refresh: () => { if (ME) home(false); } };
function setOS(play) {
  PLAY = play;
  NOME = PLAY ? "EG PLAY OS" : "EMAGIAKU GLASS OS";
  document.getElementById("b_open").textContent = "Apri " + NOME;
  document.getElementById("m_play").hidden = !PLAY;
  if (CLOUD) {
    document.querySelectorAll("#scegli button").forEach((b) => b.classList.toggle("sel", (b.dataset.os === "play") === PLAY));
    try { localStorage.setItem("eg_cloud_os", PLAY ? "play" : "glass"); } catch (e) { /* niente memoria */ }
  } else if (PLAY) {        // testi della pagina per EG PLAY OS online
    document.title = "EG PLAY OS online";
    const b = document.querySelector(".brand b"), s = document.querySelector(".brand span");
    if (b) b.textContent = "EG PLAY OS online";
    if (s) s.textContent = "EG PLAY OS sul telefono, senza console: dall'app EG PLAY CLOUD";
  }
}
setOS(PLAY);
if (CLOUD) {
  document.getElementById("scegli").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || (b.dataset.os === "play") === PLAY) return;
    setOS(b.dataset.os === "play");
    sessionStorage.removeItem("eg_phone_closed");
    if (ME) home(false);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function view(which) {
  ["login", "signup", "verify", "mfa", "home"].forEach((s) => EG.show(s, s === which));
  document.body.classList.toggle("in-home", which === "home");      // EG CLOUD: interfaccia a tutta larghezza
  showInstall(which === "home");
}

// ------------------------------------------------------------- accesso (come EG Remoto)
async function start() {
  try {
    ME = await EG.call("GET", "/account");
    if (!ME.emailVerification) return sendVerify();
    await home();
  } catch (e) {
    view(e.type === "user_more_factors_required" ? "mfa" : "login");
  }
}

async function loginPassword(btn) {
  EG.msg(""); EG.busy(btn, true);
  try {
    await EG.logoutLocal();
    await EG.call("POST", "/account/sessions/email", { email: EG.$("email").value.trim(), password: EG.$("pw").value });
    EG.$("pw").value = "";
    await start();
  } catch (e) { EG.msg(EG.niceError(e), "bad"); } finally { EG.busy(btn, false); }
}

async function loginPasskey(btn) {
  EG.msg(""); EG.busy(btn, true, "Sblocca il telefono...");
  try {
    await EG.logoutLocal();
    const tok = await EG.passkeyToken();
    await EG.call("POST", "/account/sessions/token", { userId: tok.userId, secret: tok.secret });
    await start();
  } catch (e) { EG.msg(EG.niceError(e), "bad"); } finally { EG.busy(btn, false); }
}

async function finishMfa(btn) {
  EG.busy(btn, true);
  try {
    const code = EG.$("code").value.replace(/\s/g, "");
    const ch = await EG.call("POST", "/account/mfa/challenge", { factor: /^\d{6}$/.test(code) ? "totp" : "recoveryCode" });
    await EG.call("PUT", "/account/mfa/challenge", { challengeId: ch.$id, otp: code });
    EG.$("code").value = "";
    await start();
  } catch (e) { EG.msg(EG.niceError(e), "bad"); } finally { EG.busy(btn, false); }
}

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
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return EG.msg("Scrivi un indirizzo email valido.", "bad");
  const bad = passwordProblem(pw, email);
  if (bad) return EG.msg(bad, "bad");
  if (pw !== pw2) return EG.msg("Le due password non sono uguali.", "bad");
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
  } catch (e) { EG.msg(EG.niceError(e), "bad"); } finally { EG.busy(btn, false); }
}

async function sendVerify() {
  view("verify");
  EG.$("v_text").textContent = "Ti abbiamo mandato un codice di 6 cifre a " + ME.email + ". Guarda anche nello spam.";
  try { await EG.call("POST", "/account/verifications/email/otp", {}); } catch (e) { EG.msg(EG.niceError(e), "bad"); }
}

async function confirmVerify(btn) {
  EG.msg("");
  const code = EG.$("v_code").value.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return EG.msg("Il codice ha 6 cifre.", "bad");
  EG.busy(btn, true);
  try {
    await EG.call("PUT", "/account/verifications/email/otp", { userId: ME.$id, secret: code });
    EG.$("v_code").value = "";
    await start();
  } catch (e) { EG.msg(EG.niceError(e), "bad"); } finally { EG.busy(btn, false); }
}

// ------------------------------------------------------------- stato del sistema online
async function system() {
  if (SYS) return SYS;
  const list = (await (await fetch("../remoto/cloud.json", { cache: "no-cache" })).json()).sistemi || [];
  SYS = list.find((c) => /^wss:\/\//.test(c.ws || "")) || null;
  return SYS;
}

let LAST = null;   // ultimo stato letto (postazioni libere, ore rimaste)

// ore gratis rimaste nel mese (le conta il sistema online; da spento mostro l'ultimo valore conosciuto)
function showHours() {
  let h = LAST && typeof LAST.ore_rimaste === "number" ? LAST : null;
  try {
    if (h) localStorage.setItem("eg_ore", JSON.stringify({ r: h.ore_rimaste, m: h.ore_mese, t: Date.now() }));
    else { const s = JSON.parse(localStorage.getItem("eg_ore") || "null"); if (s) h = { ore_rimaste: s.r, ore_mese: s.m, vecchio: true }; }
  } catch (e) { /* niente memoria */ }
  const el = EG.$("ore");
  if (!h) { el.hidden = true; return; }
  const pct = h.ore_mese ? Math.max(0, Math.min(100, (h.ore_rimaste / h.ore_mese) * 100)) : 0;
  el.hidden = false;
  el.querySelector("b").textContent = String(h.ore_rimaste).replace(".", ",") + " ore";
  el.querySelector("span").textContent = "rimaste questo mese su " + String(h.ore_mese).replace(".", ",") +
    (h.vecchio ? " (ultimo dato)" : "");
  el.querySelector("i").style.width = pct + "%";
  el.classList.toggle("poche", h.ore_rimaste < 3);
}
async function isOn(c) {
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 6000);
  try { LAST = await (await fetch(c.stato, { cache: "no-store", signal: ctl.signal })).json(); return !!LAST.ok; }
  catch (e) { LAST = null; return false; }
}

async function home(autoOpen = true) {
  view("home");
  EG.$("who").textContent = "Account: " + ME.email;
  if (CLOUD && window.EGCloudHome) window.EGCloudHome(ME);     // EG CLOUD: Home, Libreria e Cerca (cloud/cloud-ui.js)
  const dot = EG.$("dot");
  dot.className = "dot";
  EG.$("st_title").textContent = "Controllo " + NOME + "...";
  EG.$("st_text").textContent = "";
  EG.show("b_on", false);
  const c = await system().catch(() => null);
  if (!c) {
    EG.$("st_title").textContent = "Sistema online non disponibile";
    EG.$("st_text").textContent = "Riprova piu' tardi.";
    EG.$("b_open").disabled = true;
    return;
  }
  EG.$("b_open").disabled = false;
  const on = await isOn(c);
  showHours();
  if (on) {
    dot.classList.add("on");
    if (LAST && LAST.in_uso) {
      EG.$("st_title").textContent = "" + NOME + " e' pieno";
      EG.$("st_text").textContent = "Tutte le " + (LAST.postazioni || 3) + " postazioni sono occupate. Riprova tra qualche minuto.";
      return;
    }
    EG.$("st_title").textContent = "" + NOME + " e' acceso";
    EG.$("st_text").textContent = (LAST && LAST.postazioni ? "Postazioni libere: " + LAST.libere + " di " +
      LAST.postazioni + ". " : "") + "Si apre a tutto schermo; tocca il pallino EG per tastiera e menu. Quando esci, " +
      "dopo un minuto e mezzo la tua postazione viene ripulita (file e account cancellati).";
    if (autoOpen && !CLOUD && !sessionStorage.getItem("eg_phone_closed")) openOS();   // EG CLOUD: resta sulla Home
  } else {
    dot.classList.add("off");
    EG.$("st_title").textContent = "" + NOME + " e' spento";
    EG.$("st_text").textContent = c.funzione ?
      "Si spegne da solo dopo 30 minuti che non lo usi. Premi Accendi: si apre da solo appena e' pronto (1-2 minuti)." :
      "Si spegne da solo dopo 30 minuti che non lo usi. Premi Accendi: su GitHub premi \"Restart codespace\", " +
      "poi torna qui: si apre da solo appena e' pronto (circa 1-2 minuti).";
    EG.$("b_on").textContent = c.funzione ? "Accendi" : "Accendi (si apre GitHub)";
    EG.show("b_on", !!c.funzione || /^https:\/\/(github\.com|[a-z0-9-]+\.github\.dev)\//.test(c.accendi || ""));
  }
}

// ------------------------------------------------------------- tutto schermo
function setStatus(t) { EG.$("status").textContent = t || ""; }

async function openOS() {
  EG.msg("");
  const c = await system();
  if (!c) return;
  OPEN = true;
  EG.show("ui", false);
  EG.show("os", true);
  EG.show("menu", false);
  goFullscreen();
  checkTurn();
  setStatus("Apro " + NOME + "...");
  try {
    if (!window.EGCloud) await new Promise((ok) => window.addEventListener("egcloud-ready", ok, { once: true }));
    let on = false;
    for (let i = 0; i < 60 && OPEN; i++) {            // fino a 4 minuti (accensione del Codespace + desktop)
      if (await isOn(c)) { on = true; break; }
      setStatus("Aspetto che " + NOME + " si accenda... (" + (i * 4) + " s)");
      await sleep(4000);
    }
    if (!OPEN) return;
    if (!on) throw new Error("" + NOME + " e' spento: premi Accendi e riprova.");
    const jwt = (await EG.call("POST", "/account/jwts", {})).jwt;
    setStatus("Entro con il tuo Account EMAGIAKU...");
    EGCloud.connect(c, jwt, { screen: EG.$("screen"), status: setStatus, ended: (r) => { if (OPEN) closeOS(r); },
      connected: () => { if (PLAY) setTimeout(() => EGCloud.play(), 1500); } });
  } catch (e) {
    closeOS(EG.niceError(e));
  }
}

function closeOS(reason) {
  OPEN = false;
  if (window.EGCloud) EGCloud.stop();
  EG.$("screen").textContent = "";
  EG.show("os", false);
  EG.show("ui", true);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (reason) EG.msg(reason, "bad");
  sessionStorage.setItem("eg_phone_closed", "1");      // non riaprire da solo finche' non lo chiedi
  if (ME) home(false);
}

function goFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  try { screen.orientation.lock("landscape").catch(() => {}); } catch (e) { /* iPhone: non si puo' */ }
}

function checkTurn() {
  const portrait = window.innerHeight > window.innerWidth;
  EG.show("turn", OPEN && portrait && !sessionStorage.getItem("eg_turn_ok"));
}
window.addEventListener("resize", checkTurn);
EG.$("b_turn_ok").onclick = () => { sessionStorage.setItem("eg_turn_ok", "1"); checkTurn(); };

// pallino EG: trascinabile, un tocco apre il menu
(function bubble() {
  const b = EG.$("bubble");
  let start = null, moved = false;
  b.addEventListener("pointerdown", (e) => { start = { x: e.clientX, y: e.clientY, r: b.getBoundingClientRect() }; moved = false; b.setPointerCapture(e.pointerId); });
  b.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 8) return;
    moved = true;
    const x = Math.min(window.innerWidth - start.r.width, Math.max(0, start.r.left + dx));
    const y = Math.min(window.innerHeight - start.r.height, Math.max(0, start.r.top + dy));
    Object.assign(b.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto" });
    EG.show("menu", false);
  });
  b.addEventListener("pointerup", () => { if (start && !moved) EG.show("menu", EG.$("menu").hidden); start = null; });
})();

const kbd = EG.$("kbd");
function key(k, mods) { if (window.EGCloud && EGCloud.active()) EGCloud.key(k, mods || []); }
kbd.addEventListener("input", () => { if (kbd.value && window.EGCloud) { EGCloud.text(kbd.value); kbd.value = ""; } });
kbd.addEventListener("keydown", (e) => {
  const special = ["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (special.includes(e.key)) { e.preventDefault(); key(e.key); }
});
document.addEventListener("keydown", (e) => {     // tastiera fisica (Bluetooth o tablet)
  if (!OPEN || document.activeElement === kbd || !window.EGCloud || !EGCloud.active()) return;
  const mods = [e.ctrlKey && "Control", e.altKey && "Alt", e.metaKey && "Meta"].filter(Boolean);
  e.preventDefault();
  if (e.key.length === 1 && !mods.length) EGCloud.text(e.key);
  else key(e.key.length === 1 ? e.key.toLowerCase() : e.key, e.shiftKey && mods.length ? mods.concat("Shift") : mods);
});

EG.$("menu").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const a = b.dataset.act;
  EG.show("menu", false);
  if (a === "kbd") kbd.focus();
  else if (a === "start") { if (window.EGCloud) EGCloud.menu(); }
  else if (a === "play") { if (window.EGCloud) EGCloud.play(); }
  else if (a === "esc") key("Escape");
  else if (a === "enter") key("Enter");
  else if (a === "full") goFullscreen();
  else if (a === "again") { if (window.EGCloud) EGCloud.stop(); OPEN = false; setTimeout(openOS, 300); }
  else if (a === "quit") closeOS("");
});

// ------------------------------------------------------------- installazione
let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; showInstall(true); });
function showInstall(on) {
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches || navigator.standalone;
  if (standalone || !on) { EG.show("install", false); return; }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  EG.$("install_text").textContent = installEvt ? "Installala: avrai l'icona " + APP + " e si apre a tutto schermo." :
    ios ? "Su iPhone: in Safari tocca Condividi e poi \"Aggiungi alla schermata Home\"." :
    "Dal menu del browser scegli \"Installa app\" o \"Aggiungi a schermata Home\".";
  EG.show("b_install", !!installEvt);
  EG.show("install", true);
}
EG.$("b_install").onclick = () => { if (installEvt) { installEvt.prompt(); installEvt = null; showInstall(true); } };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// ------------------------------------------------------------- pulsanti
EG.$("b_login").onclick = (e) => loginPassword(e.target);
EG.$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") loginPassword(EG.$("b_login")); });
EG.$("b_passkey").onclick = (e) => loginPasskey(e.target);
EG.show("b_passkey", EG.supportsPasskey());
EG.$("b_go_signup").onclick = () => { EG.msg(""); EG.$("s_email").value = EG.$("email").value; view("signup"); };
EG.$("b_go_login").onclick = () => { EG.msg(""); view("login"); };
EG.$("b_signup").onclick = (e) => signUp(e.target);
EG.$("b_verify").onclick = (e) => confirmVerify(e.target);
EG.$("b_verify_again").onclick = async (e) => { EG.busy(e.target, true); await sendVerify(); EG.msg("Codice mandato di nuovo.", "ok"); EG.busy(e.target, false); };
EG.$("b_mfa").onclick = (e) => finishMfa(e.target);
EG.$("b_mfa_out").onclick = async () => { await EG.logoutLocal(); view("login"); };
EG.$("b_open").onclick = () => { sessionStorage.removeItem("eg_phone_closed"); openOS(); };
EG.$("b_on").onclick = async (e) => {
  const c = await system();
  if (!c) return;
  EG.msg("");
  if (!window.EGCloud) await new Promise((ok) => window.addEventListener("egcloud-ready", ok, { once: true }));
  EG.busy(e.target, true, "Accendo...");
  const r = await EGCloud.accendi(c);                // per tutti gli account autorizzati, senza GitHub
  EG.busy(e.target, false);
  if (r.link) window.open(c.accendi, "_blank", "noopener");   // vecchio modo (solo il proprietario)
  else if (!r.ok) { EG.msg(r.errore, "bad"); return; }
  sessionStorage.removeItem("eg_phone_closed");
  openOS();                                          // aspetto che sia pronto e lo apro da solo
};
EG.$("b_out").onclick = async () => { await EG.logoutLocal(); ME = null; view("login"); };
start();
