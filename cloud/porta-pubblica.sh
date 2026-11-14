#!/bin/bash
# EMAGIAKU OS online su GitHub Codespaces: a ogni accensione GitHub rimette la porta 7860 a "Privata"
# e l'app EG GLASS PHONE / EG Remoto non puo' piu' entrare. Qui la rimettiamo "Pubblica"
# (autorizzato da EMAGIAKU.TEAM). Dentro si entra comunque solo dal cancello con l'Account EMAGIAKU.
# Usa GitHub CLI (pacchetto github-cli di Arch) con il GITHUB_TOKEN del Codespace.
[ -n "${CODESPACE_NAME:-}" ] || { echo "non sono in un Codespace"; exit 0; }
command -v gh >/dev/null || { echo "manca gh (github-cli)"; exit 1; }
for i in $(seq 1 20); do
  sleep 15
  # la porta deve essere gia' inoltrata (forwardPorts) prima di cambiarne la visibilita'
  if gh codespace ports visibility 7860:public -c "$CODESPACE_NAME" >/tmp/eg-porta.err 2>&1; then
    echo "$(date '+%H:%M:%S') porta 7860 pubblica"
    exit 0
  fi
  echo "$(date '+%H:%M:%S') tentativo $i: $(tail -n 1 /tmp/eg-porta.err)"
done
echo "non sono riuscito a rendere pubblica la porta 7860"
exit 1
