"""EMAGIAKU OS online - cancello.

L'unica porta aperta verso internet (7860). Lo schermo virtuale (VNC) ascolta solo dentro il contenitore:
per arrivarci bisogna aprire /ws e mandare come PRIMO messaggio un JWT dell'Account EMAGIAKU (Appwrite).
Il JWT viene controllato da Appwrite; l'account deve avere l'email verificata ed essere nell'elenco
EG_UTENTI (segreto dello Space: email o ID separati da virgola). Elenco vuoto = non entra nessuno.
"""
import asyncio
import json
import os
import time

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

ENDPOINT = "https://fra.cloud.appwrite.io/v1"
PROJECT = "6af5ebe90008bba8da64"
VNC = ("127.0.0.1", 5900)
ALLOWED = {x.strip().lower() for x in os.environ.get("EG_UTENTI", "").split(",") if x.strip()}
FAILS = {}            # ip -> [tempi dei tentativi sbagliati]
STARTED = time.time()

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
    if (user.get("email", "").lower() not in ALLOWED) and (user.get("$id", "").lower() not in ALLOWED):
        return None, "Questo account non e' autorizzato su questo EMAGIAKU OS online."
    return user, ""


# comandi che l'app puo' chiedere dopo l'accesso: solo questi, niente comandi liberi
COMMANDS = {
    # menu EG: il tasto Super da solo non arriva a KWin dallo schermo virtuale, quindi lo chiedo a Plasma
    "menu": ["gdbus", "call", "--session", "--dest", "org.kde.plasmashell", "--object-path", "/PlasmaShell",
             "--method", "org.kde.PlasmaShell.activateLauncherMenu"],
}


def plasma_bus():
    """Indirizzo D-Bus della sessione Plasma (preso dal processo plasmashell)."""
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open("/proc/%s/comm" % pid) as f:
                if f.read().strip() != "plasmashell":
                    continue
            with open("/proc/%s/environ" % pid, "rb") as f:
                for item in f.read().split(b"\0"):
                    if item.startswith(b"DBUS_SESSION_BUS_ADDRESS="):
                        return item.split(b"=", 1)[1].decode()
        except OSError:
            continue
    return ""


async def command(text):
    try:
        cmd = COMMANDS.get(json.loads(text).get("cmd"))
    except (ValueError, AttributeError):
        return
    bus = plasma_bus()
    if not cmd or not bus:
        return
    env = dict(os.environ, DBUS_SESSION_BUS_ADDRESS=bus, DISPLAY=":1")
    proc = await asyncio.create_subprocess_exec(*cmd, env=env, stdout=asyncio.subprocess.DEVNULL,
                                                stderr=asyncio.subprocess.DEVNULL)
    try:
        await asyncio.wait_for(proc.wait(), timeout=5)
    except asyncio.TimeoutError:
        proc.kill()


async def index(_req):
    return web.Response(text=PAGE, content_type="text/html")


async def stato(_req):
    return web.json_response({"ok": True, "nome": "EMAGIAKU OS online", "acceso_da_s": int(time.time() - STARTED)},
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
    print("EMAGIAKU OS online: entra %s" % user.get("email"), flush=True)
    try:
        reader, writer = await asyncio.open_connection(*VNC)
    except OSError:
        await ws.send_str(json.dumps({"ok": False, "errore": "Il desktop si sta ancora avviando: riprova tra poco."}))
        await ws.close()
        return ws
    await ws.send_str(json.dumps({"ok": True}))

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
                await command(msg.data)          # comandi dell'app (solo un elenco fisso, vedi COMMANDS)
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
        print("EMAGIAKU OS online: esce %s" % user.get("email"), flush=True)
    return ws


app = web.Application()
app.add_routes([web.get("/", index), web.get("/stato", stato), web.get("/ws", ws_handler)])

if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")), access_log=None)
