#!/bin/bash
# EMAGIAKU OS online: schermo virtuale (solo interno) + desktop EMAGIAKU (Plasma X11) + cancello con l'Account EMAGIAKU.
set -u
export DISPLAY=:1
export XDG_RUNTIME_DIR=/tmp/runtime-eg
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"
xdg-user-dirs-update >/dev/null 2>&1 || true

# schermo virtuale: ascolta SOLO dentro il contenitore (127.0.0.1); da fuori si passa dal cancello
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1
Xvnc :1 -geometry "${EG_GEOMETRY:-1280x800}" -depth 24 -localhost -rfbport 5900 \
     -SecurityTypes None -AlwaysShared -dpi 96 >/tmp/xvnc.log 2>&1 &
for i in $(seq 1 50); do [ -e /tmp/.X11-unix/X1 ] && break; sleep 0.2; done

# desktop: riparte da solo se si chiude (es. "Esci" dal menu)
(
  while true; do
    dbus-run-session startplasma-x11 >/tmp/plasma.log 2>&1
    sleep 2
  done
) &

exec python /opt/eg-cloud/gate.py
