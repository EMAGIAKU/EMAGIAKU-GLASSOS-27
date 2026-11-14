---
title: EMAGIAKU OS online
emoji: 💜
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
short_description: EMAGIAKU GLASS OS da usare con EG Remoto, senza PC
---

# EMAGIAKU OS online

Il sistema EMAGIAKU GLASS OS dentro un contenitore, da usare **solo** dall'app EG Remoto:
https://emagiaku.github.io/EMAGIAKU-GLASSOS-27/remoto/

- Entra solo chi ha un **Account EMAGIAKU** con l'email confermata e presente nel segreto `EG_UTENTI`
  (email separate da virgola). Se `EG_UTENTI` e' vuoto non entra nessuno.
- Il codice sta nel repository pubblico EMAGIAKU-GLASSOS-27 (cartella `cloud/`); il programma EMAGIAKU arriva
  dall'ultimo aggiornamento firmato (firma Ed25519 controllata durante la costruzione).
- Per aggiornarlo: Settings > Factory rebuild.

EMAGIAKU GLASS OS · Developed by EMAGIAKU.TEAM
