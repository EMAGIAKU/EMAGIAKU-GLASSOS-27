# EMAGIAKU OS online - il sistema EMAGIAKU GLASS OS dentro un contenitore (GitHub Codespaces, vedi .devcontainer).
# Si usa SOLO da EG Remoto con il proprio Account EMAGIAKU (vedi gate.py).
# Il programma EMAGIAKU arriva dall'ultimo aggiornamento EG firmato: la firma viene controllata qui sotto.
FROM archlinux:latest

# Arch "congelato" al 13/10/2026: KDE Plasma 6.7.5, l'ultimo con la sessione X11 (dalla 6.8 e' solo Wayland,
# che dentro uno schermo virtuale senza scheda video non parte). Archivio ufficiale di Arch Linux.
ARG EG_ARCH_DATE=2026/10/13
RUN echo "Server=https://archive.archlinux.org/repos/$EG_ARCH_DATE/\$repo/os/\$arch" > /etc/pacman.d/mirrorlist && \
    pacman-key --init && pacman-key --populate archlinux && \
    pacman -Syyuu --noconfirm --needed --disable-sandbox \
      plasma-desktop plasma-workspace plasma-x11-session kwin-x11 breeze kde-gtk-config kvantum xdg-user-dirs xdg-utils \
      tigervnc dbus python python-pyqt6 python-aiohttp python-xlib python-cryptography libnotify \
      firefox noto-fonts noto-fonts-emoji ttf-liberation poppler openssl curl ca-certificates sudo git && \
    pacman -Scc --noconfirm && rm -rf /var/cache/pacman/pkg/* && \
    sed -i 's/^#it_IT.UTF-8/it_IT.UTF-8/; s/^#en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen && \
    echo "LANG=it_IT.UTF-8" > /etc/locale.conf

# file della versione cloud (Dockerfile, gate.py, avvio, impostazioni utente) dal repository pubblico
ARG EG_REPO=https://codeload.github.com/EMAGIAKU/EMAGIAKU-GLASSOS-27/tar.gz/refs/heads/main
ARG EG_BUILD=1
RUN mkdir -p /opt/eg-cloud && curl -fsSL "$EG_REPO" | tar xz -C /opt/eg-cloud --strip-components=2 --wildcards '*/cloud/*'

# ultimo aggiornamento EMAGIAKU: firma Ed25519 verificata con la chiave pubblica, poi sha256 del pacchetto
RUN set -e; cd /tmp; B=https://raw.githubusercontent.com/EMAGIAKU/EMAGIAKU-GLASSOS-27/main/updates; \
    curl -fsSL "$B/latest.json" -o latest.json; curl -fsSL "$B/latest.sig" -o latest.sig; \
    openssl pkeyutl -verify -pubin -inkey /opt/eg-cloud/update-key.pem -rawin -in latest.json -sigfile latest.sig; \
    F=$(python -c 'import json;print(json.load(open("latest.json"))["file"])'); \
    S=$(python -c 'import json;print(json.load(open("latest.json"))["sha256"])'); \
    case "$F" in emagiaku-glass-os-*.tar.gz) ;; *) echo "nome pacchetto strano"; exit 1;; esac; \
    curl -fsSL "$B/$F" -o pkg.tgz; echo "$S  pkg.tgz" | sha256sum -c -; \
    mkdir x; tar xzf pkg.tgz -C x; R=x; [ -d x/root ] && R=x/root; \
    cp -a "$R"/usr/. /usr/; [ -d "$R/etc" ] && cp -a "$R"/etc/. /etc/; \
    python -c 'import json;print(json.load(open("latest.json"))["version"])' > /etc/emagiaku/version; \
    rm -rf /tmp/*; \
    # KWin chiede la priorita' alta con un permesso speciale che nei contenitori non c'e': senza parte lo stesso
    setcap -r /usr/bin/kwin_x11 2>/dev/null || true; setcap -r /usr/bin/kwin_wayland 2>/dev/null || true; \
    # nel cloud non servono: accesso remoto (siamo gia' remoti), EG Update (si aggiorna ricostruendo lo Space)
    rm -f /etc/xdg/autostart/emagiaku-remote.desktop /etc/xdg/autostart/emagiaku-update.desktop \
          /etc/skel/.config/autostart/emagiaku-game-boost.desktop /etc/skel/.config/autostart/emagiaku-pro-promo.desktop \
          /opt/eg-cloud/skel/.config/autostart/emagiaku-pro-promo.desktop; \
    chmod 755 /usr/bin/emagiaku-* /opt/eg-cloud/start.sh

# utente del desktop (Hugging Face avvia i contenitori come uid 1000)
RUN useradd -m -u 1000 -s /bin/bash eg && cp -a /opt/eg-cloud/skel/. /home/eg/ && \
    echo "EMAGIAKU OS online" > /etc/hostname && chown -R eg:eg /home/eg
USER eg
ENV HOME=/home/eg LANG=it_IT.UTF-8 EG_CLOUD=1
WORKDIR /home/eg
EXPOSE 7860
CMD ["/opt/eg-cloud/start.sh"]
