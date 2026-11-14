"""EMAGIAKU - funzione Appwrite "eg-accendi": accende il PC virtuale (GitHub Codespace) per gli account autorizzati.

Chi la chiama deve essere entrato con l'Account EMAGIAKU (Appwrite passa l'ID utente nell'intestazione
x-appwrite-user-id). La funzione controlla con la chiave dinamica di Appwrite che l'account abbia l'email
confermata e sia nell'elenco EG_UTENTI, poi chiede a GitHub di accendere il Codespace.

Variabili della funzione (le imposta EMAGIAKU.TEAM nella console Appwrite, mai nel codice):
  GH_TOKEN      token GitHub "fine-grained" solo per il repository EMAGIAKU-GLASSOS-27, con SOLO i permessi
                "Codespaces" (lettura) e "Codespaces lifecycle admin" (lettura e scrittura)
  EG_UTENTI     email autorizzate separate da virgola (le stesse del segreto Codespaces)
  EG_CODESPACE  nome del Codespace (urban-space-robot-4gq77jj9g6x3q547)
Permessi della chiave dinamica (Impostazioni > Scopes): users.read
"""
import json
import os
import urllib.error
import urllib.request

GITHUB = "https://api.github.com"


def _http(method, url, headers, body=None, timeout=20):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}


def main(context):
    res = context.res
    hdr = {k.lower(): v for k, v in (context.req.headers or {}).items()}
    uid = hdr.get("x-appwrite-user-id", "")
    if not uid:
        return res.json({"ok": False, "errore": "Entra prima con il tuo Account EMAGIAKU."}, 401)

    # chi e'? (chiave dinamica dell'esecuzione, permesso users.read)
    endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT", "https://fra.cloud.appwrite.io/v1")
    code, user = _http("GET", "%s/users/%s" % (endpoint, uid), {
        "X-Appwrite-Project": os.environ.get("APPWRITE_FUNCTION_PROJECT_ID", ""),
        "X-Appwrite-Key": hdr.get("x-appwrite-key", ""),
        "Content-Type": "application/json"})
    if code != 200:
        context.error("lettura utente: %s" % code)
        return res.json({"ok": False, "errore": "Controllo dell'account non riuscito: riprova."}, 500)
    allowed = {x.strip().lower() for x in os.environ.get("EG_UTENTI", "").split(",") if x.strip()}
    if not user.get("emailVerification"):
        return res.json({"ok": False, "errore": "Prima conferma la tua email."}, 403)
    if "*" not in allowed and user.get("email", "").lower() not in allowed:   # "*" = aperto a tutti
        return res.json({"ok": False, "errore": "Il tuo account non e' autorizzato su EMAGIAKU OS online: "
                                               "chiedi a EMAGIAKU.TEAM."}, 403)

    # accendo il Codespace
    token = os.environ.get("GH_TOKEN", "")
    name = os.environ.get("EG_CODESPACE", "")
    if not token or not name:
        return res.json({"ok": False, "errore": "Accensione non ancora configurata."}, 503)
    gh = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "EMAGIAKU-accendi"}
    code, cs = _http("GET", "%s/user/codespaces/%s" % (GITHUB, name), gh)
    if code != 200:
        context.error("stato codespace: %s %s" % (code, cs.get("message", "")))
        return res.json({"ok": False, "errore": "GitHub non risponde come previsto (%s)." % code}, 502)
    state = cs.get("state", "")
    if state in ("Available", "Starting", "Rebuilding", "Queued", "Provisioning", "Awaiting"):
        return res.json({"ok": True, "stato": state, "messaggio": "Gia' acceso o in accensione."})
    code, cs = _http("POST", "%s/user/codespaces/%s/start" % (GITHUB, name), gh)
    if code not in (200, 202):
        context.error("avvio codespace: %s %s" % (code, cs.get("message", "")))
        return res.json({"ok": False, "errore": "GitHub non ha acceso il PC virtuale (%s)." % code}, 502)
    context.log("acceso da %s" % user.get("email"))
    return res.json({"ok": True, "stato": cs.get("state", "Starting"), "messaggio": "Accensione avviata."})
