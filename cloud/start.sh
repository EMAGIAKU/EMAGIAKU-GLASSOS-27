#!/bin/bash
# EMAGIAKU OS online: N postazioni (utenti posto1..N, schermi :1..:N solo interni) + cancello con l'Account EMAGIAKU.
# Gira sui server di GitHub Codespaces: il PC di chi lo usa puo' essere spento.
set -u
# gia' acceso (es. Codespaces lo riavvia due volte)? Allora non faccio niente
if curl -s -m 2 http://127.0.0.1:${PORT:-7860}/stato >/dev/null 2>&1; then exit 0; fi
POSTI="${EG_POSTI:-3}"

# postazioni: ognuna con il suo schermo virtuale e il suo desktop (riparte da solo se si chiude)
for n in $(seq 1 "$POSTI"); do
  sudo -n /opt/eg-cloud/posto.sh nuova "$n"
  ( sudo -n /opt/eg-cloud/posto.sh avvia "$n" > "/tmp/posto-$n.log" 2>&1 & )
done

# Codespaces: GitHub rimette la porta 7860 "Privata"; la tengo pubblica (controllo ogni minuto)
if [ -n "${CODESPACE_NAME:-}" ] && [ -x /opt/eg-cloud/porta-pubblica.sh ]; then
  ( /opt/eg-cloud/porta-pubblica.sh > /tmp/eg-porta.log 2>&1 & )
fi

exec python /opt/eg-cloud/gate.py
