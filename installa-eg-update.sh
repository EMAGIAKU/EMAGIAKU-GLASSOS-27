#!/usr/bin/env bash
# EMAGIAKU GLASS OS - installa EG Update (una sola volta, sui PC con l'ISO 27.0) e l'ultimo aggiornamento.
# Uso, nel terminale (Konsole) di EMAGIAKU GLASS OS:
#   curl -fsSLo /tmp/eg.sh https://raw.githubusercontent.com/EMAGIAKU/EMAGIAKU-GLASSOS-27/main/installa-eg-update.sh && sudo bash /tmp/eg.sh
# Verifica la FIRMA dell'aggiornamento con la chiave pubblica qui sotto prima di installare qualsiasi cosa.
set -euo pipefail
BASE="https://raw.githubusercontent.com/EMAGIAKU/EMAGIAKU-GLASSOS-27/main/updates"
[ "$(id -u)" = 0 ] || { echo "Avvialo con sudo: sudo bash $0"; exit 1; }
[ ! -d /run/archiso ] || { echo "Sei nel sistema live (chiavetta): installa prima EMAGIAKU GLASS OS sul disco."; exit 1; }
grep -q '^ID=emagiaku' /etc/os-release || { echo "Questo non e' EMAGIAKU GLASS OS."; exit 1; }
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
cat > "$W/key.pem" <<'KEY'
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA8whxSPwey8Zhjgv6U8COwvkHjBzxUaD19AR+qR9Jk/0=
-----END PUBLIC KEY-----
KEY
echo "Scarico l'aggiornamento..."
curl -fsSL -o "$W/latest.json" "$BASE/latest.json"
curl -fsSL -o "$W/latest.sig" "$BASE/latest.sig"
openssl pkeyutl -verify -pubin -inkey "$W/key.pem" -rawin -in "$W/latest.json" -sigfile "$W/latest.sig" >/dev/null \
  || { echo "FIRMA NON VALIDA: non installo niente."; exit 1; }
FILE=$(python3 -c 'import json,sys,re; f=json.load(open(sys.argv[1]))["file"]; assert re.match(r"^[A-Za-z0-9._-]+\.tar\.gz$", f); print(f)' "$W/latest.json")
SHA=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha256"])' "$W/latest.json")
curl -fsSL -o "$W/$FILE" "$BASE/$FILE"
[ "$(sha256sum "$W/$FILE" | cut -d' ' -f1)" = "$SHA" ] || { echo "Il pacchetto non corrisponde alla firma: non installo niente."; exit 1; }
echo "Firma verificata. Installo EG Update..."
# prima solo l'installatore di EG Update e la chiave (dal pacchetto gia' verificato)...
tar -xzf "$W/$FILE" -C "$W" usr/bin/emagiaku-update-apply usr/lib/emagiaku/updater.py usr/share/emagiaku/update-key.pem
[ "$(sha256sum < "$W/usr/share/emagiaku/update-key.pem")" = "$(sha256sum < "$W/key.pem")" ] \
  || { echo "Chiave nel pacchetto diversa: non installo niente."; exit 1; }
install -D -m 755 "$W/usr/bin/emagiaku-update-apply" /usr/bin/emagiaku-update-apply
install -D -m 644 "$W/usr/lib/emagiaku/updater.py" /usr/lib/emagiaku/updater.py
install -D -m 644 "$W/key.pem" /usr/share/emagiaku/update-key.pem
# ...poi tutto il resto con EG Update stesso (che ricontrolla firma e percorsi)
cp "$W/latest.json" "$W/$FILE.json"; cp "$W/latest.sig" "$W/$FILE.sig"
/usr/bin/emagiaku-update-apply "$W/$FILE" | grep -v '^PROGRESS'
echo
echo "Fatto. Esci e rientra (o riavvia): da ora gli aggiornamenti arrivano con una notifica."
