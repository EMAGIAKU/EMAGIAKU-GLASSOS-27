// EG PLAY CLOUD (27.22) - app per telefono, PC, tablet e TV: giochi in cloud con l'Account EMAGIAKU.
// I server EG PLAY (con scheda video) non sono ancora pronti: per ora piani + lista d'attesa (gratis, senza pagare).
// La lista d'attesa e' la preferenza privata "eg_cloud_attesa" = "piano|data" dell'account.
"use strict";
let ME = null;

const PIANI = [
  { id: "free", nome: "FREE", prezzo: "Gratis", per: "Collega i tuoi account e gioca i giochi che hai già, senza scaricare nulla.",
    cose: ["I tuoi giochi di Steam ed Epic Games", "Niente da scaricare", "Telefono, PC, tablet e TV"] },
  { id: "plus", nome: "PLUS", prezzo: "5,99 € / mese", per: "Per chi vuole giocare in cloud senza avere un PC potente.",
    cose: ["Tutto quello di FREE", "30 giochi inclusi: 15 indie, 10 arcade, 5 multiplayer", "Accesso al catalogo PLUS",
      "Streaming fino a 1080p", "Qualità grafica standard", "Accesso ai server EG PLAY", "Sessioni fino a 2 ore", "Coda standard"] },
  { id: "pro", nome: "PRO", prezzo: "11,99 € / mese", per: "Per chi vuole un'esperienza gaming più fluida.",
    cose: ["70 giochi inclusi: tutti i 30 di PLUS", "+ 20 d'azione e avventura, 10 di corse, 10 sportivi e simulatori",
      "Streaming fino a 1440p", "Hardware cloud più potente", "FPS più elevati nei giochi supportati", "Sessioni fino a 4 ore",
      "Priorità nelle code", "Salvataggi cloud", "Un dispositivo alla volta: PC, smartphone, tablet e TV compatibili"],
    nota: "2 mesi inclusi con EG GLASS OS PRO" },
  { id: "ultra", nome: "ULTRA", prezzo: "19,99 € / mese", per: "Per chi vuole il massimo delle prestazioni.",
    cose: ["120 giochi inclusi: tutti i 70 di PRO", "+ 20 AAA, 10 di corse premium, 10 simulatori, 10 giochi aggiuntivi",
      "Streaming fino a 4K", "Hardware cloud di fascia alta", "FPS fino a 120, dove supportati", "Sessioni fino a 10 ore",
      "Accesso prioritario ai server", "Salvataggi cloud sincronizzati", "Impostazioni grafiche avanzate", "Supporto multi-dispositivo"],
    nota: "Con EG GLASS OS PRO: 5 € al mese durante i 2 mesi inclusi" },
];

function view(which) {
  ["login", "signup", "verify", "mfa", "home"].forEach((s) => EG.show(s, s === which));
  showInstall(which === "home");
}

// ------------------------------------------------------------- accesso (come EG Remoto ed EG GLASS PHONE)
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

// ------------------------------------------------------------- EG GLASS OS PRO (chiave salvata nell'account, 27.20)
// impronte SHA-256 delle chiavi che includono PRO (le stesse del sistema: amministratore, PRO, premio)
const KEY_SALT = "EMAGIAKU-GLASS-OS-27";
const PRO_HASHES = new Set([
  "090f39a9cdae8e50cd3d3640c45bbaa6b39f34dbc8c2a2affd9c6bdd8c594700",
  "6cfd7678de62b6603678e0a32c9a17aa8ef84b6c779de44b8020e68321560e6d",
  "a9cc9d7f0a08497502edddbc392f239123e2d27a244eb4e18f5e483cc631a0ed",
  "3eaa9349a6dbe221d49e92391d6fd5c8eed9f5829d39729df1a932a43e25f41d",
  "8733047f21a30678549155ea654bdc55f14d10e94e3c070e8bb4b763b6f76e0d",
  "e8061e0e4139d047c05c1b899f972f34f6a2445b141415021b5cce1eede7813d",
]);
async function hasGlassPro(prefs) {
  const key = String(prefs.eg_licenza || "").trim().toUpperCase();
  if (!key || !crypto.subtle) return false;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(KEY_SALT + key));
  const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  return PRO_HASHES.has(hex);
}

// ------------------------------------------------------------- piani e lista d'attesa
let PREFS = {};
async function iscrivi(piano) {
  // Appwrite sostituisce tutte le preferenze: rileggo e aggiungo la mia
  const p = (await EG.call("GET", "/account/prefs")) || {};
  p.eg_cloud_attesa = piano ? piano + "|" + new Date().toISOString().slice(0, 10) : "";
  await EG.call("PATCH", "/account/prefs", { prefs: p });
  PREFS = p;
}

function disegnaPiani() {
  const box = EG.$("piani");
  const attuale = String(PREFS.eg_cloud_attesa || "").split("|")[0];
  box.textContent = "";
  PIANI.forEach((p) => {
    const d = document.createElement("div");
    d.className = "piano piano-" + p.id;
    d.innerHTML = '<div class="p-testa"><b></b><span class="p-stato presto">In arrivo</span></div><div class="p-prezzo"></div>' +
      '<p class="p-per"></p><ul></ul><p class="p-nota"></p><button></button>';
    d.querySelector("b").textContent = "EG PLAY CLOUD " + p.nome;
    d.querySelector(".p-prezzo").textContent = p.prezzo;
    d.querySelector(".p-per").textContent = p.per;
    p.cose.forEach((c) => { const li = document.createElement("li"); li.textContent = c; d.querySelector("ul").appendChild(li); });
    const nota = d.querySelector(".p-nota"), b = d.querySelector("button");
    if (p.nota) nota.textContent = p.nota; else nota.remove();
    const iscritto = attuale === p.id;
    b.textContent = iscritto ? "✓ Sei in lista d'attesa" : "Avvisami quando arriva";
    b.className = iscritto ? "alt" : "";
    b.onclick = async () => {
      EG.msg("");
      EG.busy(b, true);
      try {
        await iscrivi(iscritto ? "" : p.id);
        disegnaPiani();
        if (!iscritto) EG.msg("Sei in lista d'attesa per EG PLAY CLOUD " + p.nome + ": ti avvisiamo quando apre. Non paghi niente adesso.", "ok");
      } catch (e) { EG.busy(b, false); EG.msg(EG.niceError(e), "bad"); }
    };
    box.appendChild(d);
  });
}

async function home() {
  view("home");
  EG.$("who").textContent = "Account: " + ME.email;
  try { PREFS = (await EG.call("GET", "/account/prefs")) || {}; } catch (e) { PREFS = {}; }
  disegnaPiani();
  EG.show("offerta", await hasGlassPro(PREFS).catch(() => false));
}

// ------------------------------------------------------------- installazione
let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; showInstall(true); });
function showInstall(on) {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone || !on) { EG.show("install", false); return; }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  EG.$("install_text").textContent = installEvt ? "Installala: avrai l'icona EG PLAY CLOUD sul telefono o sul PC." :
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
EG.$("b_out").onclick = async () => { await EG.logoutLocal(); ME = null; view("login"); };
start();
