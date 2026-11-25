#!/bin/bash
# EMAGIAKU OS online - postazioni (27.22): ogni postazione e' un utente Linux diverso (posto1, posto2, ...)
# con il suo schermo virtuale (:N, porta 590N solo interna), il suo desktop e la sua cartella chiusa agli altri.
# Gira come root via sudo (vedi /etc/sudoers.d/eg-posti): lo chiama SOLO il cancello (utente eg).
# Azioni ammesse (nient'altro):
#   avvia N            schermo + desktop della postazione N (resta acceso, riparte se si chiude)
#   account N          scrive l'account (JSON da stdin) nella postazione N
#   dimentica N UID    toglie l'account della postazione N se e' ancora quello di UID
#   menu N             apre il menu EG nella postazione N
#   play N             apre EG PLAY a tutto schermo nella postazione N (EG PLAY OS online, 27.27)
#   ripulisci N        chiude la sessione e riporta la postazione N come nuova
set -u
ACT="${1:-}"; N="${2:-}"
MAXP="${EG_POSTI:-3}"
[[ "$N" =~ ^[1-9]$ ]] && [ "$N" -le "$MAXP" ] || { echo "postazione non valida"; exit 2; }
U="posto$N"; H="/home/$U"; RT="/tmp/runtime-$U"; LOCK="/tmp/eg-reset-$N.lock"
GEOM="${EG_GEOMETRY:-1280x800}"
id "$U" >/dev/null 2>&1 || { echo "manca l'utente $U"; exit 2; }

nuova_home() {
  find "$H" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null
  cp -a /etc/skel/. "$H"/ 2>/dev/null
  cp -a /opt/eg-cloud/skel/. "$H"/ 2>/dev/null
  rm -f "$H/.config/autostart/emagiaku-pro-promo.desktop" "$H/.config/autostart/emagiaku-game-boost.desktop"
  chown -R "$U:$U" "$H"; chmod 700 "$H"
}

case "$ACT" in
  avvia)
    mkdir -p "$RT"; chown "$U:$U" "$RT"; chmod 700 "$RT"
    rm -f "/tmp/.X$N-lock" "/tmp/.X11-unix/X$N"
    runuser -u "$U" -- Xvnc ":$N" -geometry "$GEOM" -depth 24 -localhost -rfbport "$((5900 + N))" \
        -SecurityTypes None -AlwaysShared -dpi 96 >"/tmp/xvnc-$N.log" 2>&1 &
    for i in $(seq 1 50); do [ -e "/tmp/.X11-unix/X$N" ] && break; sleep 0.2; done
    while true; do
      while [ -e "$LOCK" ]; do sleep 1; done
      runuser -u "$U" -- env -i HOME="$H" USER="$U" LOGNAME="$U" SHELL=/bin/bash PATH=/usr/bin:/bin \
          LANG=it_IT.UTF-8 DISPLAY=":$N" XDG_RUNTIME_DIR="$RT" EG_CLOUD=1 \
          dbus-run-session startplasma-x11 >"/tmp/plasma-$N.log" 2>&1
      sleep 2
    done ;;
  account)
    install -d -o "$U" -g "$U" -m 700 "$H/.config" "$H/.config/emagiaku"
    T=$(mktemp "$H/.config/emagiaku/account.XXXXXX")
    head -c 8192 > "$T"
    chown "$U:$U" "$T"; chmod 600 "$T"
    mv -f "$T" "$H/.config/emagiaku/account.json" ;;
  dimentica)
    F="$H/.config/emagiaku/account.json"
    [ -f "$F" ] && grep -q "\"uid\": \"${3:-}\"" "$F" && rm -f "$F" ;;
  menu)
    P=$(pgrep -u "$U" -x plasmashell | head -n 1)
    [ -n "$P" ] || exit 0
    BUS=$(tr '\0' '\n' < "/proc/$P/environ" | grep '^DBUS_SESSION_BUS_ADDRESS=' | cut -d= -f2-)
    runuser -u "$U" -- env DBUS_SESSION_BUS_ADDRESS="$BUS" DISPLAY=":$N" timeout 5 gdbus call --session \
        --dest org.kde.plasmashell --object-path /PlasmaShell --method org.kde.PlasmaShell.activateLauncherMenu \
        >/dev/null 2>&1 ;;
  play)
    # 27.27: EG PLAY OS online - apre EG PLAY a tutto schermo nella postazione N (una volta sola)
    pgrep -u "$U" -f "/usr/bin/emagiaku-play" >/dev/null && exit 0
    P=$(pgrep -u "$U" -x plasmashell | head -n 1)
    [ -n "$P" ] || exit 0
    BUS=$(tr '\0' '\n' < "/proc/$P/environ" | grep '^DBUS_SESSION_BUS_ADDRESS=' | cut -d= -f2-)
    runuser -u "$U" -- env HOME="$H" USER="$U" LANG=it_IT.UTF-8 DISPLAY=":$N" XDG_RUNTIME_DIR="$RT" EG_CLOUD=1 \
        DBUS_SESSION_BUS_ADDRESS="$BUS" setsid /usr/bin/emagiaku-play >"/tmp/play-$N.log" 2>&1 < /dev/null & ;;
  ripulisci)
    touch "$LOCK"
    # chiudo tutto quello della postazione tranne lo schermo virtuale (Xvnc resta acceso)
    for p in $(pgrep -u "$U"); do
      [ "$(cat /proc/$p/comm 2>/dev/null)" = "Xvnc" ] || kill -TERM "$p" 2>/dev/null
    done
    sleep 3
    for p in $(pgrep -u "$U"); do
      [ "$(cat /proc/$p/comm 2>/dev/null)" = "Xvnc" ] || kill -KILL "$p" 2>/dev/null
    done
    nuova_home
    rm -f "$LOCK"
    echo "$(date '+%H:%M:%S') postazione $N ripulita" ;;
  nuova)
    nuova_home ;;
  *)
    echo "azione non ammessa"; exit 2 ;;
esac
