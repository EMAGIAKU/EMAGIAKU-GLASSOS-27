// EMAGIAKU GLASS OS - pagine dell'Account EMAGIAKU (GitHub Pages: emagiaku.github.io)
// Parla direttamente con Appwrite Cloud (regione Francoforte). Nessun dato resta su GitHub.
"use strict";
const EG = {
  endpoint: "https://fra.cloud.appwrite.io/v1",
  project: "6af5ebe90008bba8da64",
  cookieKey: "a_session_6af5ebe90008bba8da64",
};

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
