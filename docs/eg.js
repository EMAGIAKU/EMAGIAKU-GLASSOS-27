// EMAGIAKU GLASS OS - pagine dell'Account EMAGIAKU (GitHub Pages: emagiaku.github.io)
// Parla direttamente con Appwrite Cloud (regione Francoforte). Nessun dato resta su GitHub.
"use strict";
const EG = {
  endpoint: "https://fra.cloud.appwrite.io/v1",
  project: "6af5ebe90008bba8da64",
  cookieKey: "a_session_6af5ebe90008bba8da64",
};
window.EG = EG;      // anche per i moduli (cloud.js usa window.EG per Accendi e per il rinnovo dell'accesso)

EG.errors = {
  user_invalid_credentials: "Email o password sbagliate.",
  user_invalid_token: "Codice o link non valido o scaduto: riprova.",
  user_more_factors_required: "Serve il codice della verifica in due passaggi.",
  general_rate_limit_exceeded: "Troppi tentativi: riprova tra qualche minuto.",
  user_password_recently_used: "Hai gia' usato questa password di recente: scegline un'altra.",
  password_recently_used: "Hai gia' usato questa password di recente: scegline un'altra.",
  user_password_personal_data: "La password non deve contenere nome o email.",
  password_personal_data: "La password non deve contenere nome o email.",
  user_password_pwned: "Questa password e' comparsa in un furto di dati: scegline un'altra.",
  password_pwned: "Questa password e' comparsa in un furto di dati: scegline un'altra.",
  user_session_already_exists: "Sei gia' dentro.",
};

EG.fallback = () => { try { return localStorage.getItem("eg_fallback") || ""; } catch (e) { return ""; } };

EG.call = async (method, path, body) => {
  const headers = { "Content-Type": "application/json", "X-Appwrite-Project": EG.project,
                    "X-Appwrite-Response-Format": "1.6.0", "X-Appwrite-Locale": "it" };
  const fb = EG.fallback();
  if (fb) headers["X-Fallback-Cookies"] = fb;
  let r;
  try {
    r = await fetch(EG.endpoint + path, { method, headers, credentials: "include",
                                          body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new Error("Nessuna connessione: controlla internet.");
  }
  const nf = r.headers.get("X-Fallback-Cookies");
  if (nf) { try { localStorage.setItem("eg_fallback", nf); } catch (e) { /* niente */ } }
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) {
    const err = new Error(EG.errors[data.type] || data.message || ("Errore " + r.status));
    err.type = data.type;
    throw err;
  }
  return data;
};

EG.logoutLocal = async () => {
  try { await EG.call("DELETE", "/account/sessions/current"); } catch (e) { /* gia' fuori */ }
  try { localStorage.removeItem("eg_fallback"); } catch (e) { /* niente */ }
};

// ---------------------------------------------------------------- base64url
EG.ub64 = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
EG.b64u = (buf) => {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// opzioni WebAuthn dal JSON di Appwrite (anche sui browser senza parse...FromJSON)
EG.creationOptions = (pk) => {
  pk = pk.publicKey || pk;
  if (window.PublicKeyCredential && PublicKeyCredential.parseCreationOptionsFromJSON)
    return PublicKeyCredential.parseCreationOptionsFromJSON(pk);
  const o = Object.assign({}, pk);
  o.challenge = EG.ub64(pk.challenge);
  o.user = Object.assign({}, pk.user, { id: EG.ub64(pk.user.id) });
  if (pk.excludeCredentials) o.excludeCredentials = pk.excludeCredentials.map((c) => Object.assign({}, c, { id: EG.ub64(c.id) }));
  return o;
};
EG.requestOptions = (pk) => {
  pk = pk.publicKey || pk;
  if (window.PublicKeyCredential && PublicKeyCredential.parseRequestOptionsFromJSON)
    return PublicKeyCredential.parseRequestOptionsFromJSON(pk);
  const o = Object.assign({}, pk);
  o.challenge = EG.ub64(pk.challenge);
  if (pk.allowCredentials) o.allowCredentials = pk.allowCredentials.map((c) => Object.assign({}, c, { id: EG.ub64(c.id) }));
  return o;
};
EG.credJSON = (c) => {
  if (c.toJSON) { try { return c.toJSON(); } catch (e) { /* sotto */ } }
  const r = c.response, out = { id: c.id, rawId: EG.b64u(c.rawId), type: c.type,
    authenticatorAttachment: c.authenticatorAttachment || null,
    clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {}, response: {} };
  out.response.clientDataJSON = EG.b64u(r.clientDataJSON);
  if (r.attestationObject) {
    out.response.attestationObject = EG.b64u(r.attestationObject);
    out.response.transports = r.getTransports ? r.getTransports() : [];
  }
  if (r.authenticatorData) {
    out.response.authenticatorData = EG.b64u(r.authenticatorData);
    out.response.signature = EG.b64u(r.signature);
    if (r.userHandle) out.response.userHandle = EG.b64u(r.userHandle);
  }
  return out;
};

// ------------------------------------------------------------- passkey
EG.passkeyToken = async () => {
  const ch = await EG.call("POST", "/account/tokens/passkey");
  const cred = await navigator.credentials.get({ publicKey: EG.requestOptions(ch.publicKey) });
  return EG.call("PUT", "/account/tokens/passkey", { challengeId: ch.$id, credential: EG.credJSON(cred) });
};

EG.createPasskey = async (name) => {
  const opt = await EG.call("POST", "/account/passkeys", { name });
  const cred = await navigator.credentials.create({ publicKey: EG.creationOptions(opt.publicKey) });
  return EG.call("PUT", "/account/passkeys/" + opt.passkeyId + "/verification", { credential: EG.credJSON(cred) });
};

// --------------------------------------------------- consegna al PC (AES-GCM)
EG.sendToPC = async (rowId, keyB64, token) => {
  const key = await crypto.subtle.importKey("raw", EG.ub64(keyB64), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ u: token.userId, s: token.secret }));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const blob = new Uint8Array(12 + ct.byteLength);
  blob.set(iv, 0);
  blob.set(new Uint8Array(ct), 12);
  return EG.call("POST", "/tablesdb/emagiaku/tables/qrlogin/rows",
                 { rowId, data: { data: EG.b64u(blob) }, permissions: ['read("any")', 'delete("any")'] });
};

// ---------------------------------------------------------------- pagina
EG.$ = (id) => document.getElementById(id);
EG.show = (id, on) => { const e = EG.$(id); if (e) e.hidden = !on; };
EG.msg = (text, kind) => {
  const m = EG.$("msg");
  m.textContent = text;
  m.className = "msg " + (kind || "");
  m.hidden = !text;
};
EG.busy = (btn, on, text) => {
  if (!btn) return;
  if (on) { btn.dataset.t = btn.textContent; btn.textContent = text || "Attendi..."; btn.disabled = true; }
  else { btn.textContent = btn.dataset.t || btn.textContent; btn.disabled = false; }
};
EG.params = () => new URLSearchParams(location.search);
EG.hash = () => new URLSearchParams(location.hash.replace(/^#/, ""));
EG.supportsPasskey = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
EG.niceError = (e) => {
  if (e && e.name === "NotAllowedError") return "Annullato (o nessuna passkey EMAGIAKU su questo telefono).";
  if (e && e.name === "InvalidStateError") return "Su questo telefono c'e' gia' una passkey per questo account.";
  return (e && e.message) || "Qualcosa non e' andato.";
};
// 27.28: occhio per vedere la password mentre la scrivi (in tutte le pagine e app EMAGIAKU)
EG.pwToggles = () => {
  document.querySelectorAll('input[type="password"]:not([data-eg-occhio])').forEach((inp) => {
    inp.dataset.egOcchio = "1";
    const wrap = document.createElement("span");
    wrap.className = "pw-wrap";
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pw-occhio";
    b.textContent = "👁";
    b.setAttribute("aria-label", "Mostra la password");
    b.addEventListener("click", () => {
      const mostra = inp.type === "password";
      inp.type = mostra ? "text" : "password";
      b.textContent = mostra ? "🙈" : "👁";
      b.setAttribute("aria-label", mostra ? "Nascondi la password" : "Mostra la password");
      inp.focus();
    });
    wrap.appendChild(b);
  });
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", EG.pwToggles);
else EG.pwToggles();
// 27.30: accesso con il QR nelle app (EG Remoto, EG GLASS PHONE, EG PLAY CLOUD), come su EMAGIAKU GLASS OS.
// Questo schermo mostra un QR; il telefono lo inquadra (pagina accedi.html), sblocca la passkey e lascia nella
// "casella" qrlogin il gettone di accesso cifrato con AES-GCM. La chiave sta solo nel QR (dopo '#').
EG.SITE = "https://emagiaku.github.io/EMAGIAKU-GLASSOS-27/";
EG.qrLogin = (box) => {
  const row = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const keyRaw = crypto.getRandomValues(new Uint8Array(32));
  const link = EG.SITE + "accedi.html#r=" + row + "&k=" + EG.b64u(keyRaw);
  const img = EG.endpoint + "/avatars/qr?" + new URLSearchParams({ text: link, size: 260, margin: 1, project: EG.project });
  box.textContent = "";
  box.hidden = false;
  const im = document.createElement("img");
  im.className = "qr-img";
  im.alt = "QR per entrare con il telefono";
  im.src = img;
  const p = document.createElement("p");
  p.className = "small";
  p.textContent = "Inquadra il QR con la fotocamera del telefono e sblocca la passkey EMAGIAKU: qui entri da solo. " +
    "(Prima volta? Sul telefono ti chiede di creare la passkey.)";
  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "alt";
  stop.textContent = "Annulla";
  box.append(im, p, stop);
  let fine = false;
  stop.onclick = () => { fine = true; box.hidden = true; box.textContent = ""; };
  const t0 = Date.now();
  const giro = async () => {
    if (fine) return;
    if (Date.now() - t0 > 5 * 60 * 1000) { p.textContent = "QR scaduto: premi di nuovo \"Accedi con il QR\"."; im.remove(); return; }
    let r = null;
    try { r = await EG.call("GET", "/tablesdb/emagiaku/tables/qrlogin/rows/" + row); } catch (e) { /* non ancora */ }
    if (!r || !r.data) { setTimeout(giro, 2500); return; }
    fine = true;
    try { await EG.call("DELETE", "/tablesdb/emagiaku/tables/qrlogin/rows/" + row); } catch (e) { /* gia' tolta */ }
    try {
      const blob = EG.ub64(r.data);
      const key = await crypto.subtle.importKey("raw", keyRaw, "AES-GCM", false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.slice(0, 12) }, key, blob.slice(12));
      const tok = JSON.parse(new TextDecoder().decode(plain));
      p.textContent = "Entro...";
      await EG.logoutLocal();
      await EG.call("POST", "/account/sessions/token", { userId: tok.u, secret: tok.s });
      location.reload();                       // l'app riparte gia' dentro l'account
    } catch (e) {
      p.textContent = "Accesso non riuscito: riprova con un QR nuovo.";
    }
  };
  setTimeout(giro, 2500);
};
EG.qrButton = () => {
  const login = EG.$("login"), pk = EG.$("b_passkey");
  if (!login || !pk || EG.$("b_qr") || !window.crypto || !crypto.subtle) return;
  const b = document.createElement("button");
  b.id = "b_qr";
  b.type = "button";
  b.className = "alt";
  b.textContent = "📱 Accedi con il QR (dal telefono)";
  const box = document.createElement("div");
  box.id = "qr_box";
  box.className = "qr-box";
  box.hidden = true;
  pk.after(b, box);
  b.onclick = () => EG.qrLogin(box);
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", EG.qrButton);
else EG.qrButton();
