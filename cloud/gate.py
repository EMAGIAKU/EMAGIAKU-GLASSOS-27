"""EMAGIAKU OS online - cancello.

L'unica porta aperta verso internet (7860). Gli schermi virtuali (VNC) ascoltano solo dentro il contenitore:
per arrivarci bisogna aprire /ws e mandare come PRIMO messaggio un JWT dell'Account EMAGIAKU (Appwrite).
Il JWT viene controllato da Appwrite; l'account deve avere l'email verificata ed essere nell'elenco
EG_UTENTI (segreto Codespaces: email o ID separati da virgola). Elenco vuoto = non entra nessuno.
EG_UTENTI = "*": aperto a TUTTI gli Account EMAGIAKU con email confermata.
Postazioni (27.22): EG_POSTI persone insieme (3), ognuna con il suo utente Linux, schermo e desktop
(posto.sh); quando una persona esce la sua postazione viene ripulita. /stato dice anche le ore rimaste nel mese.
"""
import asyncio
import json
import os
import time

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

ENDPOINT = "https://fra.cloud.appwrite.io/v1"
PROJECT = "6af5ebe90008bba8da64"
ALLOWED = {x.strip().lower() for x in os.environ.get("EG_UTENTI", "").split(",") if x.strip()}
PUBLIC = "*" in ALLOWED          # aperto a tutti gli Account EMAGIAKU con email confermata
FAILS = {}            # ip -> [tempi dei tentativi sbagliati]
STARTED = time.time()
# postazioni (27.22): ognuna e' un utente Linux diverso con il suo schermo :N (porta interna 5900+N)
NPOSTI = max(1, min(9, int(os.environ.get("EG_POSTI", "3"))))
POSTO = "/opt/eg-cloud/posto.sh"
SEATS = {n: {"uid": None, "conns": 0, "reset": None, "since": 0} for n in range(1, NPOSTI + 1)}
RESET_DELAY = 90      # secondi: chi preme "Ricollega" o perde la rete per un attimo non perde il lavoro
# ore gratis di GitHub Codespaces: 120 ore-core al mese -> ore di accensione = 120 / core della macchina
ORE_FILE = os.environ.get("EG_ORE_FILE", "/workspaces/.eg-ore.json")
CORE = os.cpu_count() or 2
ORE_MESE = float(os.environ.get("EG_ORE_MESE", 120.0 / CORE))

PAGE = """<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>EMAGIAKU OS online</title><body style="font-family:sans-serif;background:#120c1c;color:#eee;padding:24px">
<h1>EMAGIAKU OS online</h1><p>Il sistema e' acceso. Si usa dall'app <b>EG Remoto</b> con il tuo Account EMAGIAKU:</p>
<p><a style="color:#b48cff" href="https://emagiaku.github.io/EMAGIAKU-GLASSOS-27/remoto/">Apri EG Remoto</a></p>
<p style="opacity:.6">EMAGIAKU GLASS OS &middot; Developed by EMAGIAKU.TEAM</p></body></html>"""


def client_ip(req):
    fwd = req.headers.get("X-Forwarded-For", "")
    return fwd.split(",")[0].strip() or (req.remote or "?")


def too_many(ip):
    now = time.time()
    FAILS[ip] = [t for t in FAILS.get(ip, []) if now - t < 600]
    return len(FAILS[ip]) >= 10                       # 10 errori in 10 minuti: pausa


async def check_jwt(jwt):
    """Restituisce l'utente se il JWT e' valido e autorizzato, altrimenti un messaggio d'errore."""
    if not jwt or len(jwt) > 4096:
        return None, "Accesso non valido."
    headers = {"X-Appwrite-Project": PROJECT, "X-Appwrite-JWT": jwt, "X-Appwrite-Response-Format": "1.6.0"}
    async with ClientSession(timeout=ClientTimeout(total=10)) as s:
        async with s.get(ENDPOINT + "/account", headers=headers) as r:
            if r.status != 200:
                return None, "Accesso scaduto o non valido: rientra in EG Remoto."
            user = await r.json()
    if not user.get("emailVerification"):
        return None, "Prima conferma la tua email (EG Remoto te lo chiede dopo l'accesso)."
    if not ALLOWED:
        return None, "Nessun account e' ancora autorizzato su questo EMAGIAKU OS online."
    if PUBLIC:
        return user, ""
    if (user.get("email", "").lower() not in ALLOWED) and (user.get("$id", "").lower() not in ALLOWED):
        return None, "Questo account non e' autorizzato su questo EMAGIAKU OS online."
    return user, ""


# ---------------------------------------------------------------- postazioni
async def posto(*args, stdin=None):
    """Azione privilegiata sulle postazioni (solo quelle previste da posto.sh)."""
    proc = await asyncio.create_subprocess_exec("sudo", "-n", POSTO, *[str(a) for a in args],
                                                stdin=asyncio.subprocess.PIPE if stdin else None,
                                                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    try:
        await asyncio.wait_for(proc.communicate(stdin.encode() if stdin else None), timeout=30)
    except asyncio.TimeoutError:
        proc.kill()
    return proc.returncode == 0


def seat_of(user):
    for n, s in SEATS.items():
        if s["uid"] == user.get("$id"):
            return n
    return 0


def take_seat(user):
    """Postazione per questo account: la sua se ce l'ha gia' (Ricollega), altrimenti la prima libera. 0 = piene."""
    n = seat_of(user)
    if not n:
        n = next((k for k, s in SEATS.items() if not s["uid"]), 0)
    if not n:
        return 0
    s = SEATS[n]
    if s["reset"]:
        s["reset"].cancel()                    # e' tornato (Ricollega): niente pulizia
        s["reset"] = None
    if s["uid"] != user.get("$id"):
        s["since"] = time.time()
    s["uid"] = user.get("$id")
    s["conns"] += 1
    return n


def leave(user, n):
    s = SEATS[n]
    s["conns"] = max(0, s["conns"] - 1)
    if s["conns"] == 0 and s["uid"] == user.get("$id"):
        s["reset"] = asyncio.get_running_loop().call_later(
            RESET_DELAY, lambda: asyncio.ensure_future(free_and_reset(user, n)))


async def free_and_reset(user, n):
    s = SEATS[n]
    s["reset"] = None
    if s["conns"]:
        return
    await posto("dimentica", n, user.get("$id", ""))
    if PUBLIC:
        await posto("ripulisci", n)            # chi arriva dopo trova la postazione come nuova
        print("EMAGIAKU OS online: postazione %d ripulita" % n, flush=True)
    s["uid"] = None                            # libera per il prossimo


def free_seats():
    return sum(1 for s in SEATS.values() if not s["uid"])


# ---------------------------------------------------------------- ore rimaste nel mese
def _ore_load():
    try:
        with open(ORE_FILE, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        d = {}
    mese = time.strftime("%Y-%m")
    if d.get("mese") != mese:                  # nuovo mese: GitHub riparte da zero
        d = {"mese": mese, "secondi": 0}
    return d


ORE = _ore_load()


async def ore_counter():
    """Conta i minuti di accensione (il Codespace consuma ore solo quando e' acceso)."""
    while True:
        await asyncio.sleep(60)
        if ORE.get("mese") != time.strftime("%Y-%m"):
            ORE.update({"mese": time.strftime("%Y-%m"), "secondi": 0})
        ORE["secondi"] = int(ORE.get("secondi", 0)) + 60
        try:
            tmp = ORE_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(ORE, f)
            os.replace(tmp, ORE_FILE)
        except OSError:
            pass


def ore_rimaste():
    return max(0.0, round(ORE_MESE - int(ORE.get("secondi", 0)) / 3600.0, 1))


# Account EMAGIAKU gia' collegato nella postazione (27.21): il JWT di chi entra va nel file account
# delle app EG della SUA postazione (egcloud usa X-Appwrite-JWT). L'app lo rinnova ogni 10 minuti.
async def write_account(user, jwt, n):
    data = {"email": user.get("email", ""), "uid": user.get("$id", ""), "session": "eg-phone", "jwt": jwt,
            "verified": bool(user.get("emailVerification")), "name": user.get("name", "")}
    return await posto("account", n, stdin=json.dumps(data))


async def command(text, user, n):
    """Comandi dell'app (solo questi): rinnovo dell'account e menu EG della propria postazione."""
    try:
        msg = json.loads(text)
        name = msg.get("cmd")
    except (ValueError, AttributeError):
        return
    if name == "jwt":
        # rinnovo del pass: valido solo se e' dello STESSO account entrato dal cancello
        new_user, _err = await check_jwt(str(msg.get("jwt", "")))
        if new_user and new_user.get("$id") == user.get("$id"):
            await write_account(new_user, msg["jwt"], n)
    elif name == "menu":
        # il tasto Super da solo non arriva a KWin dallo schermo virtuale: lo chiedo a Plasma
        await posto("menu", n)


async def index(_req):
    return web.Response(text=PAGE, content_type="text/html")


async def stato(_req):
    libere = free_seats()
    return web.json_response({"ok": True, "nome": "EMAGIAKU OS online", "acceso_da_s": int(time.time() - STARTED),
                              "postazioni": NPOSTI, "libere": libere, "in_uso": libere == 0,
                              "ore_rimaste": ore_rimaste(), "ore_mese": round(ORE_MESE, 1)},
                             headers={"Access-Control-Allow-Origin": "*"})


async def ws_handler(req):
    ip = client_ip(req)
    ws = web.WebSocketResponse(protocols=("binary",), max_msg_size=8 * 1024 * 1024, heartbeat=30)
    await ws.prepare(req)
    if too_many(ip):
        await ws.send_str(json.dumps({"ok": False, "errore": "Troppi tentativi: riprova tra qualche minuto."}))
        await ws.close()
        return ws
    try:
        first = await asyncio.wait_for(ws.receive(), timeout=15)
    except asyncio.TimeoutError:
        await ws.close()
        return ws
    user, err = (None, "Accesso non valido.")
    if first.type == WSMsgType.TEXT:
        try:
            user, err = await check_jwt(json.loads(first.data).get("jwt", ""))
        except Exception:
            user, err = None, "Il controllo dell'account non e' riuscito: riprova."
    if not user:
        FAILS.setdefault(ip, []).append(time.time())
        await ws.send_str(json.dumps({"ok": False, "errore": err}))
        await ws.close()
        return ws
    n = take_seat(user)
    if not n:
        await ws.send_str(json.dumps({"ok": False, "errore": "Tutte le %d postazioni di EMAGIAKU OS online sono "
                                                              "occupate: riprova tra qualche minuto." % NPOSTI}))
        await ws.close()
        return ws
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", 5900 + n)
    except OSError:
        leave(user, n)
        await ws.send_str(json.dumps({"ok": False, "errore": "Il desktop si sta ancora avviando: riprova tra poco."}))
        await ws.close()
        return ws
    print("EMAGIAKU OS online: entra %s nella postazione %d" % (user.get("email"), n), flush=True)
    if not await write_account(user, json.loads(first.data).get("jwt", ""), n):   # account gia' collegato
        print("EMAGIAKU OS online: account non salvato nella postazione %d" % n, flush=True)
    await ws.send_str(json.dumps({"ok": True, "postazione": n}))

    async def vnc_to_ws():
        while True:
            data = await reader.read(65536)
            if not data:
                break
            await ws.send_bytes(data)

    async def ws_to_vnc():
        async for msg in ws:
            if msg.type == WSMsgType.BINARY:
                writer.write(msg.data)
                await writer.drain()
            elif msg.type == WSMsgType.TEXT:
                await command(msg.data, user, n)  # comandi dell'app (solo rinnovo account e menu EG)
            elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                break

    tasks = [asyncio.create_task(vnc_to_ws()), asyncio.create_task(ws_to_vnc())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in tasks:
            t.cancel()
        writer.close()
        await ws.close()
        leave(user, n)     # dopo 90 s senza ritorno: account dimenticato (e postazione ripulita se pubblico)
        print("EMAGIAKU OS online: esce %s dalla postazione %d" % (user.get("email"), n), flush=True)
    return ws


async def on_startup(app_):
    app_["ore"] = asyncio.create_task(ore_counter())


app = web.Application()
app.on_startup.append(on_startup)
app.add_routes([web.get("/", index), web.get("/stato", stato), web.get("/ws", ws_handler)])

if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")), access_log=None)
