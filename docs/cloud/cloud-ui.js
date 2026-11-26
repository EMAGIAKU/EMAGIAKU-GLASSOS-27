// EG CLOUD (27.30) - interfaccia: Home, Libreria e Cerca con i giochi dei TUOI account, profilo e sistemi online.
// I giochi arrivano dall'Account EMAGIAKU (preferenza privata "eg_libreria"): li manda EG PLAY OS quando premi
// SINCRONIZZA (e un minuto dopo l'avvio). Gli account di gioco collegati sono in "eg_giochi" (solo nomi, mai password).
// Accesso, sistemi online e tutto schermo sono quelli di EG GLASS PHONE (../phone/phone.js).
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  let GIOCHI = [], NEGOZI_COLL = {}, LIB_VISTA = "recenti", FILTRO = "tutti";

  const NOMI_NEGOZI = { steam: "Steam", epic: "Epic Games", ubisoft: "Ubisoft Connect", ea: "EA app",
    rockstar: "Rockstar Games", "2k": "2K", nacon: "Nacon", gog: "GOG", battlenet: "Battle.net", xbox: "Xbox / Microsoft" };
  const COLORI = { "Steam": ["#1b2838", "#2a475e"], "Epic Games": ["#202020", "#3a3a3a"], "GOG": ["#5c2b86", "#8a4fff"],
    "Ubisoft Connect": ["#0b3d91", "#1f6bd6"], "EA app": ["#7a1f2b", "#d1364a"], "Battle.net": ["#0e3a63", "#148eff"],
    "Amazon": ["#232f3e", "#ff9900"], "Rockstar Games": ["#3d3000", "#fcaf17"] };

  function leggi(prefs) {
    try {
      const d = JSON.parse(prefs.eg_libreria || "{}");
      GIOCHI = (d.g || []).filter((r) => Array.isArray(r) && r[0] && r[1]).map((r) => ({
        id: String(r[0]), nome: String(r[1]), fonte: String(r[2] || ""), ultimo: Number(r[3]) || 0, inst: !!r[4],
        img: /^https:\/\//.test(r[5] || "") ? String(r[5]) : "",
        pad: /c/.test(r[6] || ""), dita: /t/.test(r[6] || "") }));
      GIOCHI.quando = Number(d.q) || 0;
    } catch (e) { GIOCHI = []; }
    try { NEGOZI_COLL = JSON.parse(prefs.eg_giochi || "{}") || {}; } catch (e) { NEGOZI_COLL = {}; }
  }

  // ------------------------------------------------------------- copertine
  const ICONA_PAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h10a5 5 0 0 1 4.9 6l-1 5a2.6 2.6 0 0 1-4.5 1.2L14.3 16H9.7l-2.1 2.2A2.6 2.6 0 0 1 3.1 17l-1-5A5 5 0 0 1 7 6zm0 3v1.5H5.5v1.5H7v1.5h1.5V12H10v-1.5H8.5V9zm9.2.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>';
  const ICONA_DITO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 2a2 2 0 0 1 2 2v6.1l.6-.1a2 2 0 0 1 1.9 1.2 2 2 0 0 1 2.5.6 2 2 0 0 1 2.9 1.6l.1 4.1a6.5 6.5 0 0 1-6.5 6.5h-.8a6.5 6.5 0 0 1-5.3-2.8L4 15.6a1.7 1.7 0 0 1 2.6-2.2l.9 1V4a2 2 0 0 1 2-2z"/></svg>';
  function copertina(g, grande) {
    const d = document.createElement("div");
    d.className = "cl-cop" + (grande ? " grande" : "");
    const [c1, c2] = COLORI[g.fonte] || ["#2e1170", "#7a3cf0"];
    d.style.background = "linear-gradient(135deg," + c1 + "," + c2 + ")";
    const t = document.createElement("span");
    t.className = "cl-cop-nome";
    t.textContent = g.nome;
    d.appendChild(t);
    // copertina: Steam verticale, poi quella mandata da EG PLAY OS, poi Steam orizzontale; se nessuna va, il nome
    const m = /^steam:(\d+)$/.exec(g.id);
    const prove = [];
    if (m) prove.push("https://cdn.cloudflare.steamstatic.com/steam/apps/" + m[1] + "/library_600x900.jpg");
    if (g.img) prove.push(g.img);
    if (m) prove.push("https://cdn.cloudflare.steamstatic.com/steam/apps/" + m[1] + "/header.jpg");
    if (prove.length) {
      const img = new Image();
      img.alt = "";
      img.loading = "lazy";
      let i = 0;
      img.onerror = () => { i += 1; if (i < prove.length) img.src = prove[i]; else img.remove(); };
      img.onload = () => {
        if (img.naturalWidth < 40) { img.onerror(); return; }      // immagine finta/vuota: provo la prossima
        d.classList.add("con-img");
      };
      img.src = prove[0];
      d.appendChild(img);
    }
    // come si gioca (dati ufficiali del negozio Steam): controller, e il dito se si gioca anche col touch
    if (g.pad || g.dita) {
      const c = document.createElement("span");
      c.className = "cl-comandi";
      c.title = g.pad && g.dita ? "Si gioca col controller e con le dita" : g.pad ? "Si gioca col controller" : "Si gioca con le dita";
      c.innerHTML = (g.pad ? ICONA_PAD : "") + (g.dita ? ICONA_DITO : "");
      d.appendChild(c);
    }
    if (g.fonte) {
      const b = document.createElement("i");
      b.className = "cl-cop-badge";
      b.textContent = g.inst ? g.fonte + " · installato" : g.fonte;
      d.appendChild(b);
    }
    d.tabIndex = 0;
    d.setAttribute("role", "button");
    d.setAttribute("aria-label", g.nome);
    d.onclick = () => apriGioco(g);
    d.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apriGioco(g); } };
    return d;
  }

  const data = (s) => s ? new Date(s * 1000).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
  function recenti() {
    const r = GIOCHI.filter((g) => g.ultimo).sort((a, b) => b.ultimo - a.ultimo);
    return r.length ? r : GIOCHI.filter((g) => g.inst);
  }

  function vuoto(testo) {
    const p = document.createElement("div");
    p.className = "cl-vuoto";
    p.innerHTML = '<b>Nessun gioco ancora</b><span></span><a href="../play/">Collega i tuoi account ›</a>';
    p.querySelector("span").textContent = testo || "Su EG PLAY OS entra con l'Account EMAGIAKU e premi SINCRONIZZA in " +
      "Libreria: i giochi dei tuoi account (Steam, Epic, EA, Ubisoft...) compaiono qui.";
    return p;
  }

  // ------------------------------------------------------------- Home
  function disegnaHome(me) {
    const nome = (me.name || me.email.split("@")[0] || "").trim();
    $("ciao").textContent = "Ciao, " + nome + "!";
    $("ciao_sub").textContent = GIOCHI.length ? GIOCHI.length + " giochi dai tuoi account" +
      (GIOCHI.quando ? " · aggiornati il " + data(GIOCHI.quando) : "") : "I tuoi giochi e i sistemi EMAGIAKU online.";
    const box = $("recenti");
    box.textContent = "";
    const r = recenti();
    if (!GIOCHI.length) { box.appendChild(vuoto()); }
    else {
      const prima = (r.length ? r : GIOCHI).slice(0, 3);
      prima.forEach((g) => box.appendChild(copertina(g, true)));
      const altri = (r.length ? r : GIOCHI).slice(3, 7);
      if (altri.length) {               // riquadro con 4 copertine piccole: apre la Libreria
        const t = document.createElement("button");
        t.className = "cl-mosaico";
        t.setAttribute("aria-label", "Apri la Libreria");
        altri.forEach((g) => { const c = copertina(g); c.onclick = null; c.removeAttribute("role"); c.tabIndex = -1; t.appendChild(c); });
        t.onclick = () => vai("lib");
        box.appendChild(t);
      }
    }
    const n = $("negozi");
    n.textContent = "";
    Object.keys(NOMI_NEGOZI).forEach((id) => {
      if (!NEGOZI_COLL[id]) return;
      const c = document.createElement("span");
      c.className = "cl-chip ok";
      c.textContent = "✓ " + NOMI_NEGOZI[id];
      n.appendChild(c);
    });
    const a = document.createElement("a");
    a.className = "cl-chip";
    a.href = "../play/";
    a.textContent = Object.keys(NEGOZI_COLL).length ? "+ Collega altri" : "+ Collega Steam, Epic, EA, Ubisoft...";
    n.appendChild(a);
  }

  // ------------------------------------------------------------- Libreria
  function disegnaLib() {
    const box = $("lib");
    box.textContent = "";
    box.className = LIB_VISTA === "recenti" ? "cl-lista" : "cl-griglia";
    EG.show("lib_filtri", LIB_VISTA === "tutti" && GIOCHI.length > 0);
    document.querySelector(".cl-barra").hidden = LIB_VISTA === "recenti" || !GIOCHI.length;
    if (!GIOCHI.length) { box.appendChild(vuoto()); $("lib_n").textContent = ""; return; }
    if (LIB_VISTA === "recenti") {
      const r = recenti();
      if (!r.length) { box.appendChild(vuoto("Non hai ancora giocato con EG PLAY OS: le ultime partite compaiono qui.")); return; }
      let gruppo = "";
      const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
      r.slice(0, 60).forEach((g) => {
        const giorno = g.ultimo ? new Date(g.ultimo * 1000) : null;
        let nome = "Installati";
        if (giorno) {
          const d0 = new Date(giorno); d0.setHours(0, 0, 0, 0);
          const diff = Math.round((oggi - d0) / 86400000);
          nome = diff <= 0 ? "Oggi" : diff === 1 ? "Ieri" : diff < 7 ? "Questa settimana" : diff < 31 ? "Questo mese" : "Prima";
        }
        if (nome !== gruppo) {
          gruppo = nome;
          const h = document.createElement("h3");
          h.textContent = nome;
          box.appendChild(h);
        }
        const riga = document.createElement("div");
        riga.className = "cl-riga-gioco";
        riga.appendChild(copertina(g));
        const t = document.createElement("div");
        t.innerHTML = "<b></b><span></span>";
        t.querySelector("b").textContent = g.nome;
        t.querySelector("span").textContent = [data(g.ultimo), g.fonte].filter(Boolean).join(" • ");
        riga.appendChild(t);
        riga.onclick = () => apriGioco(g);
        box.appendChild(riga);
      });
      return;
    }
    // I miei giochi: filtri per negozio
    const f = $("lib_filtri");
    f.textContent = "";
    const fonti = [...new Set(GIOCHI.map((g) => g.fonte).filter(Boolean))].sort();
    [["tutti", "Tutti"], ["inst", "Installati"]].concat(fonti.map((x) => [x, x])).forEach(([id, txt]) => {
      const b = document.createElement("button");
      b.className = "cl-chip" + (FILTRO === id ? " sel" : "");
      b.textContent = txt;
      b.onclick = () => { FILTRO = id; disegnaLib(); };
      f.appendChild(b);
    });
    let lista = GIOCHI.filter((g) => FILTRO === "tutti" || (FILTRO === "inst" ? g.inst : g.fonte === FILTRO));
    const ord = $("ordine").value;
    lista = lista.slice().sort((a, b) => ord === "recenti" ? (b.ultimo - a.ultimo) || a.nome.localeCompare(b.nome, "it") :
      ord === "negozio" ? a.fonte.localeCompare(b.fonte) || a.nome.localeCompare(b.nome, "it") : a.nome.localeCompare(b.nome, "it"));
    $("lib_n").textContent = lista.length + (lista.length === 1 ? " gioco" : " giochi");
    lista.forEach((g) => box.appendChild(copertina(g)));
  }

  // ------------------------------------------------------------- Cerca
  function cerca() {
    const q = $("q").value.trim().toLowerCase();
    const box = $("cerca_ris");
    box.textContent = "";
    if (!q) return;
    const r = GIOCHI.filter((g) => g.nome.toLowerCase().includes(q)).slice(0, 120);
    if (!r.length) { const p = document.createElement("p"); p.className = "small"; p.textContent = "Nessun gioco trovato."; box.appendChild(p); return; }
    r.forEach((g) => box.appendChild(copertina(g)));
  }

  // ------------------------------------------------------------- scheda gioco
  function apriGioco(g) {
    const cop = $("g_cop");
    cop.replaceWith(Object.assign(copertina(g, true), { id: "g_cop", onclick: null }));
    $("g_nome").textContent = g.nome;
    $("g_info").textContent = [g.fonte, g.inst ? "installato su EG PLAY OS" : "nel tuo account",
      g.ultimo ? "ultima partita " + data(g.ultimo) : "",
      g.pad && g.dita ? "controller e dita" : g.pad ? "solo controller" : g.dita ? "con le dita" : ""].filter(Boolean).join(" · ");
    $("g_nota").textContent = g.inst ?
      "Lo avvii dalla Home di EG PLAY OS sul tuo PC. Il gioco in streaming dal cloud (PC con scheda video) arriva con EG PLAY CLOUD." :
      "Lo scarichi dalla Libreria di EG PLAY OS sul tuo PC. Il gioco in streaming dal cloud (PC con scheda video) arriva con EG PLAY CLOUD.";
    EG.show("gioco", true);
    $("g_play").focus();
  }
  $("g_chiudi").onclick = () => EG.show("gioco", false);
  $("gioco").addEventListener("click", (e) => { if (e.target.id === "gioco") EG.show("gioco", false); });
  $("g_play").onclick = () => { EG.show("gioco", false); window.EGPhone.setOS(true); window.EGPhone.open(); };

  // ------------------------------------------------------------- schede, pannello, sistemi
  function vai(tab) {
    ["home", "lib", "cerca"].forEach((t) => EG.show("t_" + t, t === tab));
    document.querySelectorAll(".cl-nav button").forEach((b) => b.classList.toggle("sel", b.dataset.tab === tab));
    if (tab === "lib") disegnaLib();
    if (tab === "cerca") setTimeout(() => $("q").focus(), 50);
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".cl-nav button").forEach((b) => { b.onclick = () => vai(b.dataset.tab); });
  document.querySelectorAll(".cl-seg button").forEach((b) => {
    b.onclick = () => {
      LIB_VISTA = b.dataset.l;
      document.querySelectorAll(".cl-seg button").forEach((x) => x.classList.toggle("sel", x === b));
      disegnaLib();
    };
  });
  $("ordine").onchange = disegnaLib;
  $("q").addEventListener("input", cerca);

  function pannello(on) { EG.show("pannello", on); EG.show("velo", on); }
  $("b_profilo").onclick = () => pannello(true);
  $("b_sistemi").onclick = () => pannello(true);
  $("p_chiudi").onclick = () => pannello(false);
  $("velo").onclick = () => pannello(false);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("gioco").hidden) EG.show("gioco", false); else pannello(false);
  });
  document.querySelectorAll(".cl-sis").forEach((b) => {
    b.onclick = () => { window.EGPhone.setOS(b.dataset.os === "play"); pannello(true); window.EGPhone.refresh(); };
  });
  // pallino dei sistemi in alto: stesso colore dello stato nel pannello
  new MutationObserver(() => { $("sist_dot").className = $("dot").className; })
    .observe($("dot"), { attributes: true, attributeFilter: ["class"] });

  // ------------------------------------------------------------- avvio (dopo l'accesso, da phone.js)
  window.EGCloudHome = async function (me) {
    const iniz = ((me.name || me.email || "EG").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2) || "EG").toUpperCase();
    $("b_profilo").textContent = iniz;
    $("p_avatar").textContent = iniz;
    $("p_nome").textContent = me.name || me.email;
    let prefs = {};
    try { prefs = (await EG.call("GET", "/account/prefs")) || {}; } catch (e) { /* senza preferenze: libreria vuota */ }
    leggi(prefs);
    const chiavi = [prefs.eg_licenza || ""].concat(String(prefs.eg_licenze || "").split(/[\s,;]+/)).join(" ").toUpperCase();
    const badge = [/EGPRO-/.test(chiavi) && "PRO", /EGSTD-/.test(chiavi) && "STUDY"].filter(Boolean).join(" + ");
    $("p_badge").textContent = badge;
    EG.show("p_badge", !!badge);
    disegnaHome(me);
    if (!$("t_lib").hidden) disegnaLib();
  };
})();
