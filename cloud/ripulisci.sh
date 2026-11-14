#!/bin/bash
# EMAGIAKU OS online come postazione pubblica (27.22): quando una persona esce, il desktop torna come nuovo.
# Chiude la sessione, cancella file, Firefox (cronologia, password), account e impostazioni lasciati,
# rimette le impostazioni EMAGIAKU di partenza. start.sh fa ripartire il desktop appena finito.
set -u
LOCK=/tmp/eg-reset.lock
H=/home/eg
touch "$LOCK"
# 1. chiudo la sessione del desktop (start.sh aspetta che il lucchetto sparisca prima di riaprirla)
pkill -TERM -f "startplasma-x11" ; pkill -TERM -f "plasma_session"
pkill -TERM -x plasmashell ; pkill -TERM -x kwin_x11 ; pkill -TERM -x ksmserver
pkill -TERM -f "firefox" ; pkill -TERM -f "/usr/bin/emagiaku-"
sleep 3
pkill -KILL -f "firefox" ; pkill -KILL -x plasmashell ; pkill -KILL -x kwin_x11
# 2. cancello tutto quello che l'utente ha lasciato (restano solo i file che servono a Codespaces/VS Code)
find "$H" -mindepth 1 -maxdepth 1 \
     ! -name ".vscode*" ! -name ".gitconfig" ! -name ".ssh" ! -name ".codespaces" \
     -exec rm -rf {} + 2>/dev/null
# 3. impostazioni EMAGIAKU di partenza
cp -a /etc/skel/. "$H"/ 2>/dev/null
cp -a /opt/eg-cloud/skel/. "$H"/ 2>/dev/null
rm -f "$H/.config/autostart/emagiaku-pro-promo.desktop" "$H/.config/autostart/emagiaku-game-boost.desktop"
rm -f "$LOCK"
echo "$(date '+%H:%M:%S') desktop ripulito"
