#!/bin/bash
# EMAGIAKU OS online su GitHub Codespaces: GitHub rimette la porta 7860 "Privata" a ogni accensione e anche
# quando si apre la pagina del Codespace; allora l'app EG GLASS PHONE / EG Remoto non puo' piu' entrare.
# Qui la teniamo "Pubblica" (autorizzato da EMAGIAKU.TEAM): controllo ogni minuto finche' il sistema e' acceso.
# Dentro si entra comunque solo dal cancello con l'Account EMAGIAKU. Usa GitHub CLI (pacchetto github-cli di Arch).
[ -n "${CODESPACE_NAME:-}" ] || { echo "non sono in un Codespace"; exit 0; }
command -v gh >/dev/null || { echo "manca gh (github-cli)"; exit 1; }
sleep 15
while true; do
  vis=$(gh codespace ports -c "$CODESPACE_NAME" --json sourcePort,visibility \
        -q '.[] | select(.sourcePort == 7860) | .visibility' 2>/dev/null)
  if [ "$vis" != "public" ]; then
    if gh codespace ports visibility 7860:public -c "$CODESPACE_NAME" >/tmp/eg-porta.err 2>&1; then
      echo "$(date '+%H:%M:%S') porta 7860 resa pubblica (era: ${vis:-non inoltrata})"
    else
      echo "$(date '+%H:%M:%S') non riuscito: $(tail -n 1 /tmp/eg-porta.err)"
    fi
  fi
  sleep 60
done
