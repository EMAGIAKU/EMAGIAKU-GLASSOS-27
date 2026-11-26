// EG PLAY CLOUD (27.27) - app per telefono, PC, tablet e TV: giochi in cloud con l'Account EMAGIAKU.
// I server EG PLAY (con scheda video) non sono ancora pronti: per ora piani + lista d'attesa (gratis, senza pagare).
// La lista d'attesa e' la preferenza privata "eg_cloud_attesa" = "piano|data" dell'account.
"use strict";
let ME = null;

// 27.27: niente "giochi inclusi" (servirebbero accordi con chi li crea): ogni piano include ORE di un PC cloud con
// scheda video, dove entri con i TUOI account (Steam, EA, Ubisoft, Epic...) e giochi i tuoi giochi o il tuo abbonamento.
const PIANI = [
  { id: "free", nome: "FREE", prezzo: "Gratis", per: "Per provare: gioca i giochi dei tuoi account senza scaricarli.",
    cose: ["5 ore di cloud al mese", "I giochi dei tuoi account (Steam, Epic, EA, Ubisoft...)", "Fino a 1080p, coda standard",
      "Telefono, PC, tablet e TV"] },
  { id: "plus", nome: "PLUS", prezzo: "2,99 € / mese", per: "Per chi vuole giocare in cloud senza avere un PC potente.",
    cose: ["20 ore di cloud al mese", "Tutto quello di FREE", "Fino a 1080p 60 FPS", "Sessioni fino a 2 ore"] },
  { id: "pro", nome: "PRO", prezzo: "5,99 € / mese", per: "Per chi vuole un'esperienza gaming più fluida.",
    cose: ["50 ore di cloud al mese", "Fino a 1440p", "PC cloud più potente, FPS più alti", "Sessioni fino a 4 ore",
      "Priorità nelle code", "Salvataggi cloud"],
    nota: "2 mesi inclusi con EG GLASS OS PRO" },
  { id: "ultra", nome: "ULTRA", prezzo: "9,99 € / mese", per: "Per chi vuole il massimo delle prestazioni.",
    cose: ["100 ore di cloud al mese", "Fino a 4K e 120 FPS, dove supportati", "PC cloud di fascia alta",
      "Sessioni fino a 10 ore", "Accesso prioritario ai server", "Impostazioni grafiche avanzate"],
    nota: "Con EG GLASS OS PRO: 2,50 € al mese durante i 2 mesi inclusi" },
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
  // 27.29: le chiavi possono essere piu' d'una (eg_licenza + eg_licenze, separate da virgola)
  const keys = [prefs.eg_licenza].concat(String(prefs.eg_licenze || "").split(/[\s,;]+/))
    .map((k) => String(k || "").trim().toUpperCase()).filter(Boolean);
  if (!keys.length || !crypto.subtle) return false;
  for (const key of keys) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(KEY_SALT + key));
    const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
    if (PRO_HASHES.has(hex)) return true;
  }
  return false;
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

// ------------------------------------------------------------- account di gioco (preferenza privata "eg_giochi")
// Si salva solo QUALE account hai (nome o ID pubblico), mai password o accessi: per giocare si entra una volta nel
// programma del negozio (Steam, Heroic per Epic/GOG/Amazon, Lutris per Ubisoft/EA/Rockstar/2K...).
const NEGOZI = [
  { id: "steam", nome: "Steam", steam: true },
  { id: "epic", nome: "Epic Games" },
  { id: "ubisoft", nome: "Ubisoft Connect" },
  { id: "ea", nome: "EA app" },
  { id: "rockstar", nome: "Rockstar Games" },
  { id: "2k", nome: "2K" },
  { id: "nacon", nome: "Nacon" },
  { id: "gog", nome: "GOG" },
  { id: "battlenet", nome: "Battle.net" },
  { id: "xbox", nome: "Xbox / Microsoft" },
];
function giochi() { try { return JSON.parse(PREFS.eg_giochi || "{}") || {}; } catch (e) { return {}; } }
async function salvaGiochi(g) {
  const p = (await EG.call("GET", "/account/prefs")) || {};
  p.eg_giochi = JSON.stringify(g);
  await EG.call("PATCH", "/account/prefs", { prefs: p });
  PREFS = p;
}

function disegnaAccount() {
  const box = EG.$("account_giochi");
  const g = giochi();
  box.textContent = "";
  NEGOZI.forEach((n) => {
    const a = g[n.id];
    const row = document.createElement("div");
    row.className = "account";
    row.innerHTML = '<div class="acc-info"><b></b><span></span></div><div class="acc-btn"></div>';
    row.querySelector("b").textContent = n.nome;
    row.querySelector("span").textContent = a ? "Collegato" + (a.nome ? ": " + a.nome : "") : "Non collegato";
    row.querySelector("span").className = a ? "acc-ok" : "";
    const btns = row.querySelector(".acc-btn");
    const b = document.createElement("button");
    if (a) {
      b.textContent = "Scollega";
      b.className = "alt";
      b.onclick = async () => {
        EG.busy(b, true);
        const nuovo = giochi(); delete nuovo[n.id];
        try { await salvaGiochi(nuovo); disegnaAccount(); } catch (e) { EG.busy(b, false); EG.msg(EG.niceError(e), "bad"); }
      };
    } else if (n.steam) {
      b.textContent = "Accedi con Steam";
      b.onclick = () => steamLogin();
    } else {
      b.textContent = "Collega";
      b.onclick = () => chiediNome(n, row);
    }
    btns.appendChild(b);
    box.appendChild(row);
  });
}

// nome account (non la password): serve per ricordarti dove entrare
function chiediNome(n, row) {
  const f = document.createElement("div");
  f.className = "acc-form";
  f.innerHTML = '<input maxlength="64" autocomplete="off"><button>Salva</button><p class="small"></p>';
  const inp = f.querySelector("input");
  inp.placeholder = "Nome account " + n.nome + " (non la password)";
  f.querySelector("p").textContent = "Scrivi il nome utente o l'email che usi su " + n.nome + ". La password non va mai scritta qui.";
  row.after(f);
  inp.focus();
  f.querySelector("button").onclick = async (e) => {
    const nome = inp.value.trim().slice(0, 64);
    if (!nome) { inp.focus(); return; }
    EG.busy(e.target, true);
    const g = giochi();
    g[n.id] = { nome, data: new Date().toISOString().slice(0, 10) };
    try { await salvaGiochi(g); disegnaAccount(); EG.msg(n.nome + " collegato al tuo Account EMAGIAKU.", "ok"); }
    catch (x) { EG.busy(e.target, false); EG.msg(EG.niceError(x), "bad"); }
  };
}

// Steam: accesso ufficiale "Sign in through Steam" (OpenID). Torna qui con il tuo SteamID pubblico.
function steamLogin() {
  const back = location.origin + location.pathname;
  const q = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": back + "?steam=1",
    "openid.realm": location.origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  location.href = "https://steamcommunity.com/openid/login?" + q.toString();
}
async function steamRitorno() {
  const u = new URLSearchParams(location.search);
  if (!u.get("steam")) return;
  history.replaceState(null, "", location.pathname);       // tolgo i parametri dall'indirizzo
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(u.get("openid.claimed_id") || "");
  if (u.get("openid.mode") !== "id_res" || !m) { EG.msg("Accesso a Steam annullato.", "bad"); return; }
  const g = giochi();
  g.steam = { id: m[1], nome: "SteamID " + m[1], data: new Date().toISOString().slice(0, 10) };
  try { await salvaGiochi(g); EG.msg("Steam collegato al tuo Account EMAGIAKU.", "ok"); }
  catch (e) { EG.msg(EG.niceError(e), "bad"); }
}

async function home() {
  view("home");
  EG.$("who").textContent = "Account: " + ME.email;
  try { PREFS = (await EG.call("GET", "/account/prefs")) || {}; } catch (e) { PREFS = {}; }
  await steamRitorno();
  disegnaAccount();
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
