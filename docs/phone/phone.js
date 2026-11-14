// EG GLASS PHONE - EMAGIAKU GLASS OS sul telefono, a tutto schermo, senza PC.
// Usa lo stesso sistema online di EG Remoto (../remoto/cloud.json + cloud.js con noVNC) e lo stesso Account EMAGIAKU.
"use strict";
let ME = null, SYS = null, OPEN = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function view(which) {
  ["login", "signup", "verify", "mfa", "home"].forEach((s) => EG.show(s, s === which));
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

async function isOn(c) {
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 6000);
  try { return !!(await (await fetch(c.stato, { cache: "no-store", signal: ctl.signal })).json()).ok; } catch (e) { return false; }
}

async function home(autoOpen = true) {
  view("home");
  EG.$("who").textContent = "Account: " + ME.email;
  const dot = EG.$("dot");
  dot.className = "dot";
  EG.$("st_title").textContent = "Controllo EMAGIAKU GLASS OS...";
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
  if (await isOn(c)) {
    dot.classList.add("on");
    EG.$("st_title").textContent = "EMAGIAKU GLASS OS e' acceso";
    EG.$("st_text").textContent = "Si apre a tutto schermo. Tocca il pallino EG per tastiera e menu.";
    if (autoOpen && !sessionStorage.getItem("eg_phone_closed")) openOS();
  } else {
    dot.classList.add("off");
    EG.$("st_title").textContent = "EMAGIAKU GLASS OS e' spento";
    EG.$("st_text").textContent = "Si spegne da solo dopo 30 minuti che non lo usi. Premi Accendi: si apre GitHub, " +
      "torna qui e si apre da solo appena e' pronto (circa 1-2 minuti).";
    EG.show("b_on", /^https:\/\/(github\.com|[a-z0-9-]+\.github\.dev)\//.test(c.accendi || ""));
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
  setStatus("Apro EMAGIAKU GLASS OS...");
  try {
    if (!window.EGCloud) await new Promise((ok) => window.addEventListener("egcloud-ready", ok, { once: true }));
    let on = false;
    for (let i = 0; i < 60 && OPEN; i++) {            // fino a 4 minuti (accensione del Codespace + desktop)
      if (await isOn(c)) { on = true; break; }
      setStatus("Aspetto che EMAGIAKU GLASS OS si accenda... (" + (i * 4) + " s)");
      await sleep(4000);
    }
    if (!OPEN) return;
    if (!on) throw new Error("EMAGIAKU GLASS OS e' spento: premi Accendi e riprova.");
    const jwt = (await EG.call("POST", "/account/jwts", {})).jwt;
    setStatus("Entro con il tuo Account EMAGIAKU...");
    EGCloud.connect(c, jwt, { screen: EG.$("screen"), status: setStatus, ended: (r) => { if (OPEN) closeOS(r); } });
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
  EG.$("install_text").textContent = installEvt ? "Installala: avrai l'icona EG GLASS PHONE e si apre a tutto schermo." :
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
EG.$("b_on").onclick = async () => {
  const c = await system();
  if (!c) return;
  window.open(c.accendi, "_blank", "noopener");     // GitHub accende il Codespace
  sessionStorage.removeItem("eg_phone_closed");
  openOS();                                          // qui intanto aspetto che sia pronto e lo apro da solo
};
EG.$("b_out").onclick = async () => { await EG.logoutLocal(); ME = null; view("login"); };
start();
