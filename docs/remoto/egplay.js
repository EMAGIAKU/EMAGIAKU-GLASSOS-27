// EG Remoto "Gioca" (27.22): i giochi del TUO PC EMAGIAKU sul telefono/tablet, a tutto schermo,
// con video a 60 fps, audio e controller (quello vero collegato al telefono o quello disegnato sullo schermo).
// Il PC crea un controller virtuale Xbox 360 (vpad.py). Nessun limite di tempo: il PC e' tuo.
"use strict";
(() => {
  const T_DEV = "/tablesdb/emagiaku/tables/devices/rows";
  const T_SIG = "/tablesdb/emagiaku/tables/signals/rows";
  const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
  const q = (method, attr, values) => "queries[]=" + encodeURIComponent(JSON.stringify({ method, attribute: attr, values }));
  const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const codecGet = () => { try { return localStorage.getItem("eg_codec") || (IS_IOS ? "vp8" : "h264"); } catch (e) { return IS_IOS ? "vp8" : "h264"; } };
  const codecSet = (c) => { try { localStorage.setItem("eg_codec", c); } catch (e) { /* niente */ } };

  // ------------------------------------------------------------------ i miei PC
  async function pcs() {
    const rows = ((await EG.call("GET", T_DEV)).rows || []).sort((a, b) => (b.seen || 0) - (a.seen || 0));
    const now = Date.now() / 1000;
    return rows.map((d) => Object.assign(d, { online: d.status !== "offline" && now - (d.seen || 0) < 300 }));
  }

  // ------------------------------------------------------------------ partita
  let S = null;

  async function gioca(dev, me, ui) {
    if (S) stop("");
    const codec = codecGet();
    S = { dev, me, ui, session: hex(16), codec, buttons: 0, axes: [0, 0, 0, 0], lt: 0, rt: 0, sent: "", sentAt: 0 };
    const s = S;
    costruisci(s);
    const perms = ['read("user:' + me.$id + '")', 'update("user:' + me.$id + '")', 'delete("user:' + me.$id + '")'];
    stato("Chiedo al PC \"" + (dev.name || "PC") + "\"...");
    try {
      const req = { t: Math.floor(Date.now() / 1000), codec, maxw: 1280, gioco: true };
      await EG.call("POST", T_SIG, { rowId: hex(16), permissions: perms,
        data: { device: dev.$id, session: s.session, kind: "request", data: JSON.stringify(req) } });
      let offer = null;
      for (let i = 0; i < 40 && S === s && !offer; i++) {
        await sleep(1000);
        const r = (await EG.call("GET", T_SIG + "?" + [q("equal", "device", [dev.$id]), q("equal", "session", [s.session])].join("&"))).rows || [];
        const no = r.find((x) => x.kind === "rifiuto");
        if (no) throw new Error(JSON.parse(no.data).motivo || "Il PC ha rifiutato");
        const of = r.find((x) => x.kind === "offer");
        if (of) offer = JSON.parse(of.data);
      }
      if (S !== s) return;
      if (!offer) throw new Error("Il PC non risponde: è acceso, con l'utente aperto e l'accesso remoto attivo (EG Update 27.22)?");
      stato("Collego...");
      const pc = s.pc = new RTCPeerConnection({ iceServers: STUN });
      const ms = new MediaStream();
      pc.ontrack = (ev) => { ms.addTrack(ev.track); s.video.srcObject = ms; s.video.play().catch(() => {}); if (ev.track.kind === "audio") s.audioBtn.hidden = false; };
      pc.ondatachannel = (ev) => {
        const ch = ev.channel;
        if (ch.label === "pad") s.padc = ch;
        else { s.dc = ch; ch.onmessage = (m) => messaggio(s, m.data); ch.onopen = () => stato(""); }
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") { stato(""); controllaVideo(s); }
        if (st === "failed") stop("Collegamento non riuscito: la tua rete potrebbe bloccare il collegamento diretto.");
        if (st === "closed" || st === "disconnected") stop(s.motivo || "Il PC si è scollegato.");
      };
      await pc.setRemoteDescription(offer);
      await pc.setLocalDescription(await pc.createAnswer());
      await new Promise((ok) => {
        if (pc.iceGatheringState === "complete") return ok();
        const t = setTimeout(ok, 4000);
        pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); ok(); } });
      });
      await EG.call("POST", T_SIG, { rowId: hex(16), permissions: perms,
        data: { device: dev.$id, session: s.session, kind: "answer", data: JSON.stringify({ type: "answer", sdp: pc.localDescription.sdp }) } });
      ciclo(s);
    } catch (e) {
      if (S === s) stop(EG.niceError(e));
    }
  }

  function controllaVideo(s) {
    // H.264 non arriva su qualche telefono: si riprova da soli con VP8 (come EG Remoto)
    setTimeout(() => {
      if (S !== s || s.video.videoWidth > 0) return;
      if (s.codec === "h264") {
        codecSet("vp8");
        const { dev, me, ui } = s;
        stop("");
        setTimeout(() => gioca(dev, me, ui), 800);
      } else stato("Il PC è collegato ma il video non arriva. Aggiorna il PC (EG Update) e riprova.");
    }, 8000);
  }

  function messaggio(s, data) {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (m.t === "avviso") avviso(s, m.testo, 8000);
    else if (m.t === "fine") s.motivo = m.motivo;
  }

  function stato(t) { if (S) { S.status.textContent = t || ""; S.status.hidden = !t; } }
  function avviso(s, t, ms) {
    s.toast.textContent = t; s.toast.hidden = false;
    clearTimeout(s.toastT); s.toastT = setTimeout(() => { s.toast.hidden = true; }, ms || 4000);
  }

  function stop(reason) {
    const s = S;
    if (!s) return;
    S = null;
    cancelAnimationFrame(s.raf); clearTimeout(s.loopT);
    try { if (s.padc && s.padc.readyState === "open") s.padc.send(JSON.stringify({ t: "pad", b: 0, a: [0, 0, 0, 0] })); } catch (e) { /* niente */ }
    try { s.pc && s.pc.close(); } catch (e) { /* gia' chiuso */ }
    // pulizia della segnalazione
    EG.call("GET", T_SIG + "?" + [q("equal", "device", [s.dev.$id]), q("equal", "session", [s.session])].join("&"))
      .then((r) => (r.rows || []).forEach((row) => EG.call("DELETE", T_SIG + "/" + row.$id).catch(() => {}))).catch(() => {});
    s.root.remove();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (s.ui && s.ui.ended) s.ui.ended(reason);
  }

  // ------------------------------------------------------------------ schermo di gioco + controller sullo schermo
  // Pulsanti nell'ordine "standard": 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 10 L3, 11 R3,
  // 12 su, 13 giu', 14 sinistra, 15 destra, 16 EG (Guida)
  const TASTI = [
    ["lb", 4, "LB"], ["lt", 6, "LT"], ["rb", 5, "RB"], ["rt", 7, "RT"],
    ["su", 12, "▲"], ["giu", 13, "▼"], ["sx", 14, "◀"], ["dx", 15, "▶"],
    ["a", 0, "A"], ["b", 1, "B"], ["x", 2, "X"], ["y", 3, "Y"],
    ["back", 8, "⧉"], ["start", 9, "☰"], ["guida", 16, "EG"],
  ];

  function costruisci(s) {
    const r = document.createElement("div");
    r.className = "egp";
    r.innerHTML = '<video playsinline autoplay muted></video>' +
      '<div class="egp-barra"><span class="egp-tempo"></span><button class="egp-audio" hidden>🔊 Audio</button>' +
      '<button class="egp-pad">🎮</button><button class="egp-esci">✕ Esci</button></div>' +
      '<div class="egp-status"></div><div class="egp-toast" hidden></div>' +
      '<div class="egp-gira">Gira il telefono in orizzontale per giocare</div>' +
      '<div class="egp-ctrl"><div class="egp-stick sx"><i></i></div><div class="egp-stick dx"><i></i></div></div>';
    document.body.appendChild(r);
    s.root = r;
    s.video = r.querySelector("video");
    s.status = r.querySelector(".egp-status");
    s.toast = r.querySelector(".egp-toast");
    s.tempo = r.querySelector(".egp-tempo");
    s.tempo.textContent = "🎮 " + (s.dev.name || "Il tuo PC");
    s.audioBtn = r.querySelector(".egp-audio");
    s.audioBtn.onclick = () => { s.video.muted = false; s.video.play().catch(() => {}); s.audioBtn.hidden = true; };
    r.querySelector(".egp-esci").onclick = () => stop("");
    const ctrl = r.querySelector(".egp-ctrl");
    r.querySelector(".egp-pad").onclick = () => { s.touchOff = !s.touchOff; ctrl.hidden = !!s.touchOff; };
    s.touch = 0;
    TASTI.forEach(([cls, bit, txt]) => {
      const b = document.createElement("button");
      b.className = "egp-t egp-" + cls;
      b.textContent = txt;
      const giu = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) { /* niente */ } s.touch |= 1 << bit; b.classList.add("on"); if (navigator.vibrate) navigator.vibrate(8); };
      const su = (e) => { e.preventDefault(); s.touch &= ~(1 << bit); b.classList.remove("on"); };
      b.addEventListener("pointerdown", giu);
      b.addEventListener("pointerup", su);
      b.addEventListener("pointercancel", su);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      ctrl.appendChild(b);
    });
    s.stick = [[0, 0], [0, 0]];
    ctrl.querySelectorAll(".egp-stick").forEach((el, i) => levetta(s, el, i));
    // tocco sul video (fuori dai controlli) = clic del mouse: serve per i launcher e i menu
    s.video.addEventListener("pointerup", (e) => {
      if (!s.dc || s.dc.readyState !== "open") return;
      const p = punto(s.video, e.clientX, e.clientY);
      if (p) s.dc.send(JSON.stringify({ t: "click", b: 1, x: p.x, y: p.y }));
    });
    s.video.addEventListener("contextmenu", (e) => e.preventDefault());
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    try { screen.orientation.lock("landscape").catch(() => {}); } catch (e) { /* iPhone: non si puo' */ }
  }

  function punto(v, cx, cy) {
    const r = v.getBoundingClientRect(), vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    const sc = Math.min(r.width / vw, r.height / vh), w = vw * sc, h = vh * sc;
    const x = (cx - r.left - (r.width - w) / 2) / w, y = (cy - r.top - (r.height - h) / 2) / h;
    return x < 0 || y < 0 || x > 1 || y > 1 ? null : { x, y };
  }

  function levetta(s, el, i) {
    const pomo = el.querySelector("i");
    let id = null;
    const muovi = (e) => {
      const r = el.getBoundingClientRect(), R = r.width / 2;
      let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      s.stick[i] = [dx, dy];
      pomo.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    };
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); id = e.pointerId; try { el.setPointerCapture(id); } catch (x) { /* niente */ } muovi(e); });
    el.addEventListener("pointermove", (e) => { if (e.pointerId === id) muovi(e); });
    const fine = (e) => { if (e.pointerId !== id) return; id = null; s.stick[i] = [0, 0]; pomo.style.transform = ""; };
    el.addEventListener("pointerup", fine);
    el.addEventListener("pointercancel", fine);
  }

  // stato del controller (vero + schermo) -> PC, al cambio e comunque 4 volte al secondo
  function ciclo(s) {
    const giro = () => {
      if (S !== s) return;
      let b = s.touch, ax = [s.stick[0][0], s.stick[0][1], s.stick[1][0], s.stick[1][1]], lt = 0, rt = 0, vero = false;
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      for (const p of pads) {
        vero = true;
        p.buttons.forEach((x, k) => { if (k < 17 && (x.pressed || x.value > 0.5)) b |= 1 << k; });
        if (p.mapping === "standard") {
          lt = Math.max(lt, (p.buttons[6] || {}).value || 0);
          rt = Math.max(rt, (p.buttons[7] || {}).value || 0);
        }
        for (let k = 0; k < 4; k++) { const v = p.axes[k] || 0; if (Math.abs(v) > 0.12 && Math.abs(v) > Math.abs(ax[k])) ax[k] = v; }
      }
      if (vero && !s.veroVisto) {               // controller vero: nascondo quello disegnato (si riapre con 🎮)
        s.veroVisto = true; s.touchOff = true; s.root.querySelector(".egp-ctrl").hidden = true;
        avviso(s, "Controller collegato: usa quello! (🎮 per i comandi sullo schermo)", 4000);
      }
      const msg = JSON.stringify({ t: "pad", b, a: ax.map((v) => Math.round(v * 1000) / 1000), lt: Math.round(lt * 100) / 100, rt: Math.round(rt * 100) / 100 });
      const now = performance.now();
      if (s.padc && s.padc.readyState === "open" && (msg !== s.sent || now - s.sentAt > 250)) {
        try { s.padc.send(msg); s.sent = msg; s.sentAt = now; } catch (e) { /* canale pieno: al prossimo giro */ }
      }
      s.loopT = setTimeout(giro, 16);
    };
    giro();
  }

  window.EGPlay = { pcs, gioca, stop, attivo: () => !!S };
})();
