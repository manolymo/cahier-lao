/* Cahier de lao — application d'apprentissage du lao (Vientiane).
   Tout est stocké sur l'appareil (localStorage + IndexedDB). Aucune donnée n'est envoyée. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = 86400000;
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isLao = (s) => /[຀-໿]/.test(s);

  /* ---------------- état ---------------- */
  const KEY = "cahierLao.v1";
  const defaults = () => ({ done: {}, srs: {}, newDay: "", newCount: 0, xp: {}, best: {}, voice: "f", goal: 50, base: [], lastLesson: null });
  let S = defaults();
  try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(defaults(), JSON.parse(raw)); } catch (e) {}
  let saveT = null;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 150); }
  function today(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addXP(n) {
    if (!n) return; const k = today(); S.xp[k] = (S.xp[k] || 0) + n; save(); renderStreak();
    const t = $("#toast"); if (t.hidden) toast("+" + n + " XP");
  }
  function streak() {
    let n = 0; const d = new Date();
    if (!S.xp[today(d)]) d.setDate(d.getDate() - 1);
    while (S.xp[today(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function renderStreak() { const n = streak(); $("#streak-n").textContent = n; $("#streak").classList.toggle("off", !S.xp[today()]); }

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 1700); }

  /* ---------------- IndexedDB (voix de maman) ---------------- */
  const idb = (() => {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => { try { const r = indexedDB.open("cahierLao", 1); r.onupgradeneeded = () => r.result.createObjectStore("rec"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
      return dbp;
    }
    function tx(mode, fn) { return open().then((db) => new Promise((res, rej) => { const t = db.transaction("rec", mode); const st = t.objectStore("rec"); const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); })); }
    return { get: (k) => tx("readonly", (s) => s.get(k)), set: (k, v) => tx("readwrite", (s) => s.put(v, k)), del: (k) => tx("readwrite", (s) => s.delete(k)), keys: () => tx("readonly", (s) => s.getAllKeys()) };
  })();
  let momKeys = new Set();
  idb.keys().then((k) => { momKeys = new Set(k || []); }).catch(() => {});

  /* ---------------- contenu ---------------- */
  let LESSONS = [], AUDIO = {};
  function clean(s) { return String(s).replace(/[…!?.,«»"]/g, " ").replace(/\s+/g, " ").trim(); }
  function hashKey(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return "a" + h.toString(16); }
  function lessonById(id) { return LESSONS.find((l) => l.id === id); }
  function currentLesson() { return lessonById(S.lastLesson) || LESSONS.find((l) => !S.done[l.id]) || LESSONS[LESSONS.length - 1]; }

  /* ---------------- audio ---------------- */
  const player = new Audio();
  let urlCache = {};
  async function audioUrl(text, opts) {
    const k = hashKey(clean(text)); opts = opts || {};
    if (!opts.noMom && momKeys.has(k)) {
      if (!urlCache["m" + k]) { const b = await idb.get(k).catch(() => null); if (b) urlCache["m" + k] = URL.createObjectURL(b); }
      if (urlCache["m" + k]) return urlCache["m" + k];
    }
    const e = AUDIO[k]; if (!e) return null;
    const other = S.voice === "f" ? "m" : "f";
    return e[S.voice] || e[other] || e.synth || null;
  }
  let playToken = 0;
  async function play(texts, slow, el) {
    texts = [].concat(texts); const token = ++playToken;
    $$(".say.playing").forEach((x) => x.classList.remove("playing")); if (el) el.classList.add("playing");
    for (let i = 0; i < texts.length; i++) {
      const u = await audioUrl(texts[i]);
      if (token !== playToken) return;
      if (!u) { toast("Son pas encore prêt pour cette phrase"); break; }
      await new Promise((res) => {
        player.src = u; player.playbackRate = slow ? 0.7 : 1; player.onended = res; player.onerror = res;
        player.play().catch(() => { toast("Touche à nouveau pour écouter"); res(); });
      });
      if (token !== playToken) return;
      if (i < texts.length - 1) await new Promise((r) => setTimeout(r, 450));
    }
    if (el) el.classList.remove("playing");
  }
  document.addEventListener("click", (e) => { const el = e.target.closest(".say"); if (el) play(el.dataset.t || el.textContent, false, el); });
  function decorate(root) {
    $$(".line .lo, td.lo, .sec li .lo, .sec p .lo", root).forEach((el) => { if (isLao(el.textContent) && el.textContent.trim() !== "ໆ") { el.classList.add("say"); el.setAttribute("role", "button"); el.tabIndex = 0; } });
  }
  document.addEventListener("keydown", (e) => { const el = e.target.closest && e.target.closest(".say"); if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); } });

  /* ---------------- navigation ---------------- */
  const VIEWS = ["accueil", "lecons", "reviser", "ecouter", "parler", "ecrire"];
  const RENDER = {};
  function go(v, opts) {
    if (!VIEWS.includes(v)) v = "accueil";
    playToken++; try { player.pause(); } catch (e) {}
    $$("#tabbar button").forEach((b) => b.toggleAttribute("aria-current", false)); $(`#tabbar [data-v="${v}"]`).setAttribute("aria-current", "page");
    VIEWS.forEach((n) => { $("#v-" + n).hidden = n !== v; });
    if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
    RENDER[v](opts || {});
    window.scrollTo(0, 0);
  }
  $$("#tabbar button").forEach((b) => b.addEventListener("click", () => go(b.dataset.v)));

  /* ---------------- SRS ---------------- */
  const NEW_PER_DAY = 20;
  function allCards() { const o = []; LESSONS.forEach((l) => (l.cards || []).forEach((c) => o.push(Object.assign({ lesson: l.num }, c)))); return o; }
  function rollDay() { if (S.newDay !== today()) { S.newDay = today(); S.newCount = 0; } }
  function srsQueue() {
    rollDay(); const now = Date.now(), cards = allCards();
    const due = cards.filter((c) => S.srs[c.id] && S.srs[c.id].due <= now).sort((a, b) => S.srs[a.id].due - S.srs[b.id].due);
    const fresh = cards.filter((c) => !S.srs[c.id]).slice(0, Math.max(0, NEW_PER_DAY - S.newCount));
    return { due, fresh, all: cards };
  }
  function nextState(s, g) {
    s = s ? Object.assign({}, s) : { ivl: 0, ease: 2.5, reps: 0, lapses: 0 }; const now = Date.now();
    if (g === 1) { s.ivl = 0; s.ease = Math.max(1.3, s.ease - 0.2); s.lapses++; s.reps = 0; s.due = now + 10 * 60000; return s; }
    if (g === 2) { s.ivl = Math.max(1, Math.round(s.ivl * 1.2)); s.ease = Math.max(1.3, s.ease - 0.15); }
    if (g === 3) s.ivl = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.ivl * s.ease);
    if (g === 4) { s.ivl = s.reps === 0 ? 3 : Math.round(Math.max(1, s.ivl) * s.ease * 1.3); s.ease += 0.15; }
    s.reps++; s.due = now + s.ivl * DAY; return s;
  }
  function updateDueDot() { const q = srsQueue(); $("#due-dot").hidden = !(q.due.length + q.fresh.length); }

  /* ================= ACCUEIL ================= */
  RENDER.accueil = function () {
    const v = $("#v-accueil"); const xp = S.xp[today()] || 0; const goal = S.goal; const pct = Math.min(1, xp / goal);
    const q = srsQueue(); const l = currentLesson(); const C = 2 * Math.PI * 38;
    const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ k: today(d), lab: "dlmmjvs"[d.getDay()].toUpperCase() }); }
    v.innerHTML = `
      <div class="stack">
        <div class="panel goal">
          <svg class="ring" viewBox="0 0 92 92" aria-label="Objectif du jour"><circle class="bgc" cx="46" cy="46" r="38"/><circle class="fg" cx="46" cy="46" r="38" transform="rotate(-90 46 46)" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/><text x="46" y="53" text-anchor="middle">${xp}</text></svg>
          <div><p class="eyebrow">Aujourd'hui</p><h2>${xp >= goal ? "Objectif atteint" : (goal - xp) + " XP avant l'objectif"}</h2>
          <p class="muted" style="margin:2px 0 0">${streak() ? "Série : " + streak() + " jour" + (streak() > 1 ? "s" : "") + " d'affilée." : "Fais un exercice pour lancer ta série."}</p></div>
        </div>
        <div class="todo">
          ${l ? `<button data-go="lecons" data-id="${l.id}"><span><b>Leçon ${l.num} · ${esc(l.title)}</b><small>${S.done[l.id] ? "Faite · relire" : "À faire"}</small></span><span class="chip ${S.done[l.id] ? "done" : ""}">Lire</span></button>` : ""}
          <button data-go="reviser"><span><b>Réviser les cartes</b><small>${q.due.length} à revoir · ${q.fresh.length} nouvelles</small></span><span class="chip">${q.due.length + q.fresh.length}</span></button>
          <button data-go="ecouter"><span><b>Exercices d'écoute</b><small>Le texte caché, seulement le son</small></span><span class="chip">+2/réponse</span></button>
          <button data-go="parler"><span><b>Parler : tes tons au micro</b><small>Compare ta courbe à celle du modèle</small></span><span class="chip">+5</span></button>
          <button data-go="ecrire"><span><b>Écrire</b><small>Assembler des phrases, dictée</small></span><span class="chip">+5</span></button>
        </div>
        <div class="panel"><p class="eyebrow">7 derniers jours</p>
          <div class="week">${days.map((d) => `<div><i><b style="height:${Math.min(100, (S.xp[d.k] || 0) / goal * 100)}%"></b></i>${d.lab}</div>`).join("")}</div></div>
        <div class="panel settings stack"><p class="eyebrow" style="margin:0">Réglages</p>
          <div class="row"><span>Voix des modèles</span><div class="seg" id="voice-seg"><button data-v="f" aria-pressed="${S.voice === "f"}">Femme</button><button data-v="m" aria-pressed="${S.voice === "m"}">Homme</button></div></div>
          <div class="row"><span>Objectif quotidien</span><div class="seg" id="goal-seg">${[30, 50, 80].map((g) => `<button data-g="${g}" aria-pressed="${S.goal === g}">${g} XP</button>`).join("")}</div></div>
          <p class="muted" style="margin:0;font-size:.88rem">Tes progrès restent sur cet appareil. Pour passer du téléphone à l'ordinateur, exporte puis importe ta sauvegarde.</p>
          <div class="row"><button class="btn" id="export">Exporter ma sauvegarde</button><label class="btn" for="import">Importer</label><input type="file" id="import" accept="application/json,.json" hidden></div>
        </div>
      </div>`;
    $$("[data-go]", v).forEach((b) => b.addEventListener("click", () => { if (b.dataset.id) S.lastLesson = b.dataset.id; go(b.dataset.go, { id: b.dataset.id }); }));
    $$("#voice-seg button", v).forEach((b) => b.addEventListener("click", () => { S.voice = b.dataset.v; save(); RENDER.accueil(); }));
    $$("#goal-seg button", v).forEach((b) => b.addEventListener("click", () => { S.goal = +b.dataset.g; save(); RENDER.accueil(); }));
    $("#export", v).addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(S)], { type: "application/json" }); const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "cahier-lao-sauvegarde-" + today() + ".json"; document.body.appendChild(a); a.click(); a.remove();
    });
    $("#import", v).addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const d = JSON.parse(await f.text()); if (!d || typeof d !== "object" || !("srs" in d)) throw 0; S = Object.assign(defaults(), d); save(); toast("Sauvegarde importée"); RENDER.accueil(); renderStreak(); updateDueDot(); }
      catch (err) { toast("Ce fichier n'est pas une sauvegarde du Cahier"); }
    });
  };

  /* ================= LEÇONS ================= */
  RENDER.lecons = function (o) {
    const v = $("#v-lecons"); const id = o.id;
    if (!id) {
      v.innerHTML = `<div class="stack"><div><p class="eyebrow">Parcours</p><h2>Leçons</h2></div>` +
        LESSONS.map((l) => `<button class="lrow" data-id="${l.id}"><span class="lnum">${String(l.num).padStart(2, "0")}</span><span class="ltitle">${esc(l.title)}<small>${esc(l.phase)}</small></span><span class="chip ${S.done[l.id] ? "done" : ""}">${S.done[l.id] ? "Faite" : "À faire"}</span></button>`).join("") +
        `<p class="muted" style="font-size:.88rem">Les nouvelles leçons arrivent ici dès que Claude les publie.</p></div>`;
      $$(".lrow", v).forEach((b) => b.addEventListener("click", () => { S.lastLesson = b.dataset.id; save(); RENDER.lecons({ id: b.dataset.id }); window.scrollTo(0, 0); }));
      return;
    }
    const l = lessonById(id); if (!l) return RENDER.lecons({});
    const secs = l.sections || [];
    v.innerHTML = `<div class="panel">
      <button class="btn ghost" id="back" style="padding-left:0">← Toutes les leçons</button>
      <p class="eyebrow">Leçon ${l.num} · ${esc(l.phase)}</p><h2>${esc(l.title)}</h2>
      ${l.objective ? `<p class="lead">${esc(l.objective)}</p>` : ""}
      <nav class="toc">${secs.map((s, i) => `<a href="#" data-s="${i}">${i + 1}. ${esc(s.title)}</a>`).join("")}</nav>
      ${secs.map((s, i) => `<section class="sec" id="sec-${i}"><h3><span class="n">${String(i + 1).padStart(2, "0")}</span>${esc(s.title)}</h3>${s.html || ""}</section>`).join("")}
      <section class="sec"><h3><span class="n">✓</span>Bloc de suivi</h3><p class="muted">Colle-le dans le projet « Prof de laotien » pour reprendre où tu t'es arrêtée.</p><pre class="copy" id="suivi">${esc(l.suivi || "")}</pre>
        <div class="row"><button class="btn" id="copy">Copier le bloc</button><button class="btn primary" id="mark">${S.done[l.id] ? "Leçon faite ✓" : "Marquer comme faite (+20 XP)"}</button></div></section>
    </div>`;
    decorate(v);
    $("#back", v).addEventListener("click", () => RENDER.lecons({}));
    $$(".toc a", v).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); $("#sec-" + a.dataset.s).scrollIntoView({ behavior: "smooth" }); }));
    $("#copy", v).addEventListener("click", () => {
      const t = l.suivi || ""; const sel = () => { const r = document.createRange(); r.selectNodeContents($("#suivi")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Texte sélectionné"); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast("Bloc copié"), sel); else sel();
    });
    $("#mark", v).addEventListener("click", () => { const was = S.done[l.id]; S.done[l.id] = !was; if (!was) addXP(20); save(); RENDER.lecons({ id }); });
  };

  /* ================= RÉVISER ================= */
  let cur = null, flipped = false;
  RENDER.reviser = function () {
    const v = $("#v-reviser"); const q = srsQueue(); updateDueDot();
    cur = q.due[0] || q.fresh[0] || null; flipped = false;
    const head = `<div><p class="eyebrow">Répétition espacée</p><h2>Réviser</h2></div>
      <div class="stats"><span>À revoir <b>${q.due.length}</b></span><span>Nouvelles aujourd'hui <b>${S.newCount}</b>/${NEW_PER_DAY}</span><span>Vues <b>${q.all.filter((c) => S.srs[c.id]).length}</b>/${q.all.length}</span></div>`;
    if (!cur) { v.innerHTML = `<div class="stack">${head}<div class="panel done"><p class="lo" style="font-size:2rem;color:var(--indigo);margin:0">ດີຫຼາຍ</p><p class="muted">Rien à revoir pour l'instant. Reviens plus tard ou passe à l'écoute.</p></div></div>`; return; }
    const front = cur.front, laoF = isLao(front);
    v.innerHTML = `<div class="stack">${head}
      <div class="card"><div><div class="front ${laoF ? "" : "latin"}">${esc(front)}</div>
        ${laoF ? `<button class="btn ghost" id="c-play" style="margin-top:6px">▶ Écouter</button>` : ""}
        <div class="back" id="c-back" hidden>${esc(cur.back)}</div><div class="src">Leçon ${cur.lesson}${S.srs[cur.id] ? "" : " · nouvelle"}</div></div></div>
      <button class="btn primary big" id="flip">Voir la réponse</button>
      <div class="grades" id="grades" hidden>${[["1", "Raté", "10 min"], ["2", "Difficile", ""], ["3", "Bien", ""], ["4", "Facile", ""]].map(([g, n, t]) => `<button class="btn g${g}" data-g="${g}">${n}<small>${t || ivlLabel(nextState(S.srs[cur.id], +g).ivl)}</small></button>`).join("")}</div>
    </div>`;
    if (laoF) $("#c-play", v).addEventListener("click", () => play(front));
    $("#flip", v).addEventListener("click", flip);
    $$("#grades button", v).forEach((b) => b.addEventListener("click", () => grade(+b.dataset.g)));
  };
  function ivlLabel(d) { return d <= 1 ? "1 jour" : d < 31 ? d + " jours" : Math.round(d / 30) + " mois"; }
  function flip() { if (!cur || flipped) return; flipped = true; $("#c-back").hidden = false; $("#flip").hidden = true; $("#grades").hidden = false; if (isLao(cur.front)) play(cur.front); }
  function grade(g) { if (!cur) return; if (!S.srs[cur.id]) S.newCount++; S.srs[cur.id] = nextState(S.srs[cur.id], g); addXP(1); save(); RENDER.reviser(); }
  document.addEventListener("keydown", (e) => {
    if ($("#v-reviser").hidden || !cur || e.target.matches("input,textarea")) return;
    if (e.key === " " && !flipped) { e.preventDefault(); flip(); } else if (flipped && "1234".includes(e.key)) grade(+e.key);
  });

  /* ================= ÉCOUTER ================= */
  let ex = null;
  RENDER.ecouter = function () {
    const v = $("#v-ecouter"); const l = LESSONS.filter((x) => (x.listening || []).length).find((x) => x.id === (currentLesson() || {}).id) || LESSONS.filter((x) => (x.listening || []).length).pop();
    if (!l) { v.innerHTML = `<div class="panel">Les exercices d'écoute arrivent avec les leçons.</div>`; return; }
    ex = null;
    v.innerHTML = `<div class="stack"><div><p class="eyebrow">Compréhension orale · Leçon ${l.num}</p><h2>Écouter</h2>
      <p class="lead">Le texte reste caché, tu n'as que le son. Réécoute autant que tu veux, au ralenti si besoin.</p></div>
      <div class="pick">${l.listening.map((e, i) => `<button data-i="${i}"><span class="k">Exercice ${i + 1}</span><b>${esc(e.title)}</b><small>${esc(e.subtitle || "")}</small><small>${S.best[l.id + ":" + i] ? "Meilleur score : " + S.best[l.id + ":" + i] : e.questions.length + " questions"}</small></button>`).join("")}</div></div>`;
    $$(".pick button", v).forEach((b) => b.addEventListener("click", () => startEx(l, +b.dataset.i)));
  };
  function startEx(l, i) {
    const e = l.listening[i];
    ex = { l, i, e, qi: 0, ok: 0, order: e.shuffle === false ? e.questions.map((_, k) => k) : shuffle(e.questions.map((_, k) => k)) };
    renderQ();
  }
  function renderQ() {
    const v = $("#v-ecouter"); const { e } = ex; const n = e.questions.length;
    if (ex.qi >= n) {
      const k = ex.l.id + ":" + ex.i; const prev = S.best[k]; if (!prev || +prev.split("/")[0] < ex.ok) S.best[k] = ex.ok + "/" + n; save();
      v.innerHTML = `<div class="panel done stack"><p class="eyebrow">${esc(e.title)}</p><div class="score">${ex.ok} / ${n}</div>
        <p class="muted">${ex.ok === n ? "Sans faute." : ex.ok >= n * 0.7 ? "Solide. Refais-le demain pour ancrer." : "Refais-le maintenant au ralenti, puis demain."}</p>
        <div class="row" style="justify-content:center"><button class="btn primary" id="again">Recommencer</button>${ex.i + 1 < ex.l.listening.length ? `<button class="btn" id="nexte">Exercice suivant</button>` : ""}<button class="btn ghost" id="list">Tous les exercices</button></div></div>`;
      $("#again").addEventListener("click", () => startEx(ex.l, ex.i));
      if ($("#nexte")) $("#nexte").addEventListener("click", () => startEx(ex.l, ex.i + 1));
      $("#list").addEventListener("click", () => RENDER.ecouter());
      return;
    }
    const q = e.questions[ex.order[ex.qi]]; const opts = q.fixed ? q.options : shuffle(q.options);
    v.innerHTML = `<div class="stack"><div class="ex-top"><button class="btn ghost" id="quit" style="padding-left:0">← ${esc(e.title)}</button><span class="muted" style="font-variant-numeric:tabular-nums">${ex.qi + 1}/${n}</span></div>
      <div class="bar"><i style="width:${ex.qi / n * 100}%"></i></div>
      ${ex.qi === 0 && e.instructions ? `<p class="lead" style="margin:0">${esc(e.instructions)}</p>` : ""}
      <div class="row"><button class="btn primary big" id="p">▶ Écouter</button><button class="btn" id="ps">Au ralenti</button></div>
      <p class="prompt">${esc(q.prompt)}</p><div class="opts">${opts.map((o) => `<button class="btn" data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div><div id="rev" class="stack"></div></div>`;
    $("#quit").addEventListener("click", () => RENDER.ecouter());
    $("#p").addEventListener("click", () => play(q.audio)); $("#ps").addEventListener("click", () => play(q.audio, true));
    let answered = false;
    $$(".opts .btn", v).forEach((b) => b.addEventListener("click", () => {
      if (answered) return; answered = true; const right = b.dataset.o === q.answer;
      if (right) { ex.ok++; b.classList.add("ok"); addXP(2); } else { b.classList.add("ko"); $$(".opts .btn", v).forEach((x) => { if (x.dataset.o === q.answer) x.classList.add("ok"); }); }
      $("#rev").innerHTML = `<div class="reveal"><b>${right ? "Juste." : "Pas tout à fait."}</b> ${q.audio.map((t) => `<span class="lo">${esc(t)}</span>`).join("")}${q.reveal ? `<div>${q.reveal}</div>` : ""}</div>
        <div class="row feedback-bar"><button class="btn primary big" id="nx">Continuer</button><button class="btn" id="rp">Réécouter</button></div>`;
      $("#nx").addEventListener("click", () => { ex.qi++; renderQ(); }); $("#rp").addEventListener("click", () => play(q.audio)); $("#nx").focus();
    }));
    setTimeout(() => { if (!$("#v-ecouter").hidden) play(q.audio); }, 250);
  }

  /* ================= PARLER (micro + courbes de ton) ================= */
  const PITCH = (() => {
    // YIN simplifié : renvoie un tableau de fréquences (0 = non voisé), une valeur toutes les 10 ms
    function track(x, sr) {
      const hop = Math.round(sr * 0.01), W = Math.round(sr * 0.04), minL = Math.floor(sr / 500), maxL = Math.floor(sr / 70);
      let peak = 0; for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
      const out = []; const d = new Float32Array(maxL + 1);
      for (let s = 0; s + W + maxL < x.length; s += hop) {
        let e = 0; for (let i = 0; i < W; i++) e += x[s + i] * x[s + i];
        const rms = Math.sqrt(e / W);
        if (rms < peak * 0.06) { out.push(0); continue; }
        d[0] = 1; let run = 0, best = -1;
        for (let L = 1; L <= maxL; L++) {
          let sum = 0; for (let i = 0; i < W; i++) { const df = x[s + i] - x[s + i + L]; sum += df * df; }
          run += sum; d[L] = run ? sum * L / run : 1;
          if (L >= minL && best < 0 && d[L] < 0.15) { while (L + 1 <= maxL) { let s2 = 0; for (let i = 0; i < W; i++) { const df = x[s + i] - x[s + i + L + 1]; s2 += df * df; } const nd = s2 * (L + 1) / (run + s2); if (nd < d[L]) { run += s2; L++; d[L] = nd; } else break; } best = L; break; }
        }
        if (best < 0) { out.push(0); continue; }
        const a = d[best - 1] || d[best], b = d[best], c = d[best + 1] || d[best]; const den = a - 2 * b + c;
        const L2 = best + (den ? (a - c) / (2 * den) : 0);
        out.push(sr / L2);
      }
      // filtre : supprime sauts d'octave isolés et micro-segments
      for (let i = 1; i < out.length - 1; i++) if (out[i] && out[i - 1] && out[i + 1]) { const m = (out[i - 1] + out[i + 1]) / 2; if (Math.abs(12 * Math.log2(out[i] / m)) > 5) out[i] = m; }
      for (let i = 0; i < out.length; i++) { if (!out[i]) continue; let j = i; while (j < out.length && out[j]) j++; if (j - i < 4) for (let k = i; k < j; k++) out[k] = 0; i = j; }
      return out;
    }
    function median(a) { const b = a.filter(Boolean).slice().sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : 0; }
    function st(hz, base) { return 12 * Math.log2(hz / base); }
    // contour voisé, temps normalisé 0..1 (segments non voisés conservés comme trous)
    function contour(f, base) {
      let a = f.findIndex(Boolean), b = f.length - 1 - f.slice().reverse().findIndex(Boolean); if (a < 0) return [];
      const pts = []; for (let i = a; i <= b; i++) pts.push({ x: (i - a) / Math.max(1, b - a), y: f[i] ? st(f[i], base) : null });
      return pts;
    }
    function resample(pts, n) {
      const v = pts.filter((p) => p.y != null); if (v.length < 3) return null;
      const lo = Math.floor(v.length * 0.1), hi = Math.ceil(v.length * 0.92); const w = v.slice(lo, hi);
      const out = []; for (let i = 0; i < n; i++) { const t = i / (n - 1) * (w.length - 1); const j = Math.floor(t), fr = t - j; out.push(w[j].y * (1 - fr) + (w[Math.min(j + 1, w.length - 1)].y) * fr); }
      return out;
    }
    return { track, median, contour, resample };
  })();

  let actx = null;
  function ctx() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
  async function decode(blobOrUrl) {
    const buf = typeof blobOrUrl === "string" ? await (await fetch(blobOrUrl)).arrayBuffer() : await blobOrUrl.arrayBuffer();
    const ab = await new Promise((res, rej) => { const p = ctx().decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
    const ch = ab.getChannelData(0);
    // sous-échantillonne à ~16 kHz pour accélérer
    const f = Math.max(1, Math.floor(ab.sampleRate / 16000)); const x = new Float32Array(Math.floor(ch.length / f));
    for (let i = 0; i < x.length; i++) x[i] = ch[i * f];
    return { x, sr: ab.sampleRate / f };
  }
  const refCache = {};
  async function refPitch(text) {
    const u = await audioUrl(text); if (!u) return null;
    if (refCache[u]) return refCache[u];
    const { x, sr } = await decode(u); refCache[u] = PITCH.track(x, sr); return refCache[u];
  }

  let sp = { i: 0, rec: null, chunks: [], stream: null, mine: null, mineUrl: null, l: null, momMode: false };
  RENDER.parler = function () {
    const v = $("#v-parler"); const l = currentLesson();
    sp.l = LESSONS.filter((x) => (x.speak || []).length).find((x) => x.id === (l || {}).id) || LESSONS.filter((x) => (x.speak || []).length).pop();
    if (!sp.l) { v.innerHTML = `<div class="panel">Les exercices de prononciation arrivent avec les leçons.</div>`; return; }
    sp.i = Math.min(sp.i, sp.l.speak.length - 1); sp.mine = null; renderSpeak();
  };
  function renderSpeak() {
    const v = $("#v-parler"); const items = sp.l.speak; const it = items[sp.i]; const k = sp.l.id + ":s:" + sp.i; const best = S.best[k];
    const hasMom = momKeys.has(hashKey(clean(it.lao)));
    v.innerHTML = `<div class="stack">
      <div><p class="eyebrow">Prononciation · Leçon ${sp.l.num}</p><h2>Parler</h2>
      <p class="lead" style="margin-bottom:0">Écoute le modèle, enregistre-toi, puis compare les deux mélodies. La ligne safran, c'est le modèle ; l'indigo, c'est toi.</p></div>
      <div class="panel stack">
        <div class="navrow"><button class="btn ghost" id="prev" ${sp.i ? "" : "disabled"}>←</button><span class="muted" style="font-variant-numeric:tabular-nums">${sp.i + 1} / ${items.length}${best ? " · meilleur " + best : ""}</span><button class="btn ghost" id="next" ${sp.i < items.length - 1 ? "" : "disabled"}>→</button></div>
        <div class="target"><span class="lo">${esc(it.lao)}</span><span class="rom">${esc(it.rom)}</span> · <span class="muted">${esc(it.fr)}${it.tone ? " · ton " + esc(it.tone) : ""}</span></div>
        <div class="row" style="justify-content:center">
          <button class="btn" id="model">▶ Modèle</button><button class="btn" id="slow">Ralenti</button>
          <button class="btn primary big" id="rec"><span class="rec-dot" hidden></span><span id="rec-l">● M'enregistrer</span></button>
          <button class="btn" id="mine" disabled>▶ Ma voix</button>
        </div>
        <canvas class="plot" id="plot" width="800" height="300" aria-label="Courbes de mélodie"></canvas>
        <div class="legend"><span><i style="background:var(--accent)"></i>Modèle${hasMom ? " (maman)" : ""}</span><span><i style="background:var(--indigo)"></i>Toi</span><span>Axe vertical : grave → aigu</span></div>
        <div id="score"></div>
      </div>
      <details><summary>Ajouter la voix de maman pour cette phrase</summary>
        <p class="muted" style="font-size:.9rem">Fais dire la phrase à ta mère et enregistre-la ici : sa voix devient le modèle partout dans l'app pour cette phrase (écoute et comparaison). Elle reste sur cet appareil.</p>
        <div class="row"><button class="btn" id="mom-rec">● Enregistrer maman</button>${hasMom ? `<button class="btn" id="mom-play">▶ Écouter maman</button><button class="btn ghost" id="mom-del">Supprimer</button>` : ""}</div>
      </details>
      <p class="muted" style="font-size:.85rem">Le score compare seulement la mélodie (les tons). Il ne juge ni les consonnes ni les voyelles : pour ça, ta mère reste la meilleure correctrice.${it.kind === "tone" ? " Astuce : commence par ຄ່າ (ton moyen) pour que l'app apprenne la hauteur naturelle de ta voix." : ""}</p>
    </div>`;
    $("#prev").addEventListener("click", () => { sp.i--; sp.mine = null; renderSpeak(); });
    $("#next").addEventListener("click", () => { sp.i++; sp.mine = null; renderSpeak(); });
    $("#model").addEventListener("click", () => play(it.lao)); $("#slow").addEventListener("click", () => play(it.lao, true));
    $("#rec").addEventListener("click", () => toggleRec(false));
    $("#mine").addEventListener("click", () => { if (sp.mineUrl) { playToken++; player.src = sp.mineUrl; player.playbackRate = 1; player.play().catch(() => {}); } });
    $("#mom-rec").addEventListener("click", () => toggleRec(true));
    if ($("#mom-play")) $("#mom-play").addEventListener("click", () => play(it.lao));
    if ($("#mom-del")) $("#mom-del").addEventListener("click", async () => { const h = hashKey(clean(it.lao)); await idb.del(h).catch(() => {}); momKeys.delete(h); delete urlCache["m" + h]; Object.keys(refCache).forEach((u) => { if (u.startsWith("blob:")) delete refCache[u]; }); renderSpeak(); });
    drawPlot(null, null);
    refPitch(it.lao).then((f) => { if (f) { sp.ref = f; drawPlot(f, null); } }).catch(() => {});
  }
  async function toggleRec(mom) {
    const btn = mom ? $("#mom-rec") : $("#rec");
    if (sp.rec && sp.rec.state === "recording") { sp.rec.stop(); return; }
    try { sp.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { toast("Autorise le micro pour t'enregistrer"); return; }
    playToken++; try { player.pause(); } catch (e) {}
    sp.chunks = []; const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]; const mt = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    sp.rec = new MediaRecorder(sp.stream, mt ? { mimeType: mt } : undefined);
    sp.rec.ondataavailable = (e) => { if (e.data.size) sp.chunks.push(e.data); };
    sp.rec.onstop = async () => {
      sp.stream.getTracks().forEach((t) => t.stop()); clearTimeout(sp.auto);
      const blob = new Blob(sp.chunks, { type: sp.rec.mimeType || "audio/webm" });
      const it = sp.l.speak[sp.i];
      if (mom) {
        const h = hashKey(clean(it.lao)); await idb.set(h, blob).catch(() => toast("Enregistrement impossible sur cet appareil")); momKeys.add(h); delete urlCache["m" + h];
        toast("Voix de maman enregistrée"); renderSpeak(); return;
      }
      if (sp.mineUrl) URL.revokeObjectURL(sp.mineUrl); sp.mineUrl = URL.createObjectURL(blob);
      btn.classList.remove("rec"); $(".rec-dot").hidden = true; $("#rec-l").textContent = "● Recommencer"; $("#mine").disabled = false;
      try { const { x, sr } = await decode(blob); analyse(PITCH.track(x, sr), it); }
      catch (e) { $("#score").innerHTML = `<p class="muted">Je n'ai pas pu analyser l'enregistrement. Réessaie, un peu plus près du micro.</p>`; }
    };
    sp.rec.start();
    if (mom) { btn.textContent = "■ Arrêter"; } else { btn.classList.add("rec"); $(".rec-dot").hidden = false; $("#rec-l").textContent = "Arrêter"; }
    sp.auto = setTimeout(() => { if (sp.rec.state === "recording") sp.rec.stop(); }, mom ? 8000 : 6000);
  }
  function analyse(mine, it) {
    const voiced = mine.filter(Boolean);
    if (voiced.length < 8) { $("#score").innerHTML = `<p class="muted">Je n'entends presque rien. Parle un peu plus fort ou plus près du micro.</p>`; drawPlot(sp.ref, null); return; }
    const myMed = PITCH.median(mine);
    if (it.kind === "tone") { S.base.push(myMed); if (S.base.length > 12) S.base.shift(); if (it.tone === "moyen") S.midBase = myMed; save(); }
    sp.mine = mine; drawPlot(sp.ref, mine);
    if (!sp.ref) { $("#score").innerHTML = `<p class="muted">Modèle pas encore disponible pour cette phrase.</p>`; return; }
    const { refBase, myBase } = bases(it);
    const r = PITCH.resample(PITCH.contour(sp.ref, refBase), 24), m = PITCH.resample(PITCH.contour(mine, myBase), 24);
    if (!r || !m) { $("#score").innerHTML = ""; return; }
    let se = 0; for (let i = 0; i < 24; i++) se += (r[i] - m[i]) ** 2; const rms = Math.sqrt(se / 24);
    const score = Math.max(0, Math.min(100, Math.round(100 - rms * 16)));
    const k = sp.l.id + ":s:" + sp.i; const prev = S.best[k]; if (!prev || +prev < score) S.best[k] = String(score); save();
    if (score >= 70) addXP(5);
    $("#score").innerHTML = `<div class="scorebox"><div class="s">${score}</div><div>${feedback(r, m, it)}</div></div>`;
  }
  function bases(it) {
    const refMed = PITCH.median(sp.ref);
    if (it.kind !== "tone") return { refBase: refMed, myBase: PITCH.median(sp.mine) };
    // tons isolés : hauteur de référence = ton moyen du modèle et de ta voix
    const midItem = sp.l.speak.find((x) => x.tone === "moyen");
    const refMid = midItem && refCache[midItem._u] ? PITCH.median(refCache[midItem._u]) : null;
    const myMid = S.midBase || (S.base.length ? PITCH.median(S.base) : PITCH.median(sp.mine));
    return { refBase: refMid || refBaseGuess(it, refMed), myBase: myMid };
  }
  function refBaseGuess(it, med) {
    // sans ton moyen de référence : on recentre le modèle selon le profil attendu du ton
    const shift = { "montant": 0, "haut": 3, "moyen": 0, "bas": -2.5, "haut descendant": 1.5, "bas descendant": -1.5 }[it.tone] || 0;
    return med / Math.pow(2, shift / 12);
  }
  function feedback(r, m, it) {
    const dR = r[r.length - 1] - r[0], dM = m[m.length - 1] - m[0];
    const avgR = r.reduce((a, b) => a + b, 0) / r.length, avgM = m.reduce((a, b) => a + b, 0) / m.length;
    const tips = [];
    const dir = (d) => d > 1.5 ? "monte" : d < -1.5 ? "descend" : "reste plate";
    if (dir(dR) !== dir(dM)) tips.push(`La mélodie du modèle <b>${dir(dR)}</b>, la tienne <b>${dir(dM)}</b>.`);
    else if (Math.abs(dR) > 1.5 && Math.abs(dM) < Math.abs(dR) * 0.5) tips.push("Bonne direction, mais exagère le mouvement.");
    if (it.kind === "tone") { if (avgM - avgR > 2) tips.push("Tu pars trop haut : pose ta voix plus bas."); else if (avgR - avgM > 2) tips.push("Tu restes trop bas : monte ta voix."); }
    if (!tips.length) tips.push("La forme de ta mélodie colle au modèle. Fais-la valider par ta mère.");
    return tips.join(" ");
  }
  // mémorise l'URL du ton moyen pour l'étalonnage
  async function warmMid() {
    const l = sp.l; if (!l) return; const mid = l.speak.find((x) => x.tone === "moyen"); if (!mid) return;
    mid._u = await audioUrl(mid.lao); if (mid._u && !refCache[mid._u]) refPitch(mid.lao).catch(() => {});
  }
  function drawPlot(ref, mine) {
    const c = $("#plot"); if (!c) return; const g = c.getContext("2d"); const W = c.width, H = c.height;
    const cs = getComputedStyle(document.documentElement);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = cs.getPropertyValue("--line"); g.lineWidth = 1;
    for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, H * i / 5); g.lineTo(W, H * i / 5); g.stroke(); }
    const it = sp.l.speak[sp.i];
    const draw = (f, base, color, width) => {
      if (!f) return; const pts = PITCH.contour(f, base); if (!pts.length) return;
      const y = (s) => H / 2 - s * (H / 22); // ±11 demi-tons
      g.strokeStyle = color; g.lineWidth = width; g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath(); let pen = false;
      pts.forEach((p) => { const X = 30 + p.x * (W - 60); if (p.y == null) { pen = false; return; } const Y = Math.max(6, Math.min(H - 6, y(p.y))); if (!pen) { g.moveTo(X, Y); pen = true; } else g.lineTo(X, Y); });
      g.stroke();
    };
    let rb = ref ? PITCH.median(ref) : 0, mb = mine ? PITCH.median(mine) : 0;
    if (sp.ref && sp.mine) { const b = bases(it); rb = b.refBase; mb = b.myBase; }
    else if (ref && it.kind === "tone") rb = refBaseGuess(it, rb);
    draw(ref, rb, cs.getPropertyValue("--accent").trim(), 7);
    draw(mine, mb, cs.getPropertyValue("--indigo").trim(), 5);
    if (!ref && !mine) { g.fillStyle = cs.getPropertyValue("--muted"); g.font = "26px sans-serif"; g.textAlign = "center"; g.fillText("Chargement du modèle…", W / 2, H / 2); }
  }

  /* ================= ÉCRIRE ================= */
  let wr = { mode: "build", i: 0 };
  RENDER.ecrire = function () {
    const v = $("#v-ecrire"); const l = currentLesson();
    wr.l = LESSONS.filter((x) => (x.build || []).length).find((x) => x.id === (l || {}).id) || LESSONS.filter((x) => (x.build || []).length).pop();
    if (!wr.l) { v.innerHTML = `<div class="panel">Les exercices d'écriture arrivent avec les leçons.</div>`; return; }
    wr.i = 0; wr.ok = 0; wr.order = shuffle((wr.mode === "build" ? wr.l.build : wr.l.write).map((_, k) => k)); renderWrite();
  };
  function renderWrite() {
    const v = $("#v-ecrire"); const list = wr.mode === "build" ? wr.l.build : wr.l.write; const n = list.length;
    const head = `<div><p class="eyebrow">Expression écrite · Leçon ${wr.l.num}</p><h2>Écrire</h2></div>
      <div class="seg" id="wmode"><button data-m="build" aria-pressed="${wr.mode === "build"}">Assembler</button><button data-m="dict" aria-pressed="${wr.mode === "dict"}">Dictée</button></div>`;
    if (wr.i >= n) {
      v.innerHTML = `<div class="stack">${head}<div class="panel done stack"><div class="score">${wr.ok} / ${n}</div><p class="muted">${wr.ok === n ? "Sans faute." : "Refais une série pour ancrer."}</p><div class="row" style="justify-content:center"><button class="btn primary" id="again">Nouvelle série</button></div></div></div>`;
      bindMode(); $("#again").addEventListener("click", () => RENDER.ecrire()); return;
    }
    const it = list[wr.order[wr.i]];
    const top = `${head}<div class="bar"><i style="width:${wr.i / n * 100}%"></i></div>`;
    if (wr.mode === "build") {
      const pool = shuffle(wr.l.build.flatMap((b) => b.tokens).filter((t) => !it.tokens.includes(t)));
      const extra = [...new Set(pool)].slice(0, Math.min(3, Math.max(2, 6 - it.tokens.length)));
      const tiles = shuffle(it.tokens.concat(extra));
      v.innerHTML = `<div class="stack">${top}
        <p class="prompt">Écoute et assemble la phrase en lao.</p>
        <div class="row"><button class="btn primary" id="p">▶ Écouter</button><button class="btn" id="ps">Ralenti</button><span class="muted">« ${esc(it.fr)} »</span></div>
        <div class="answer" id="ans" aria-label="Ta réponse"></div>
        <div class="tiles" id="tiles">${tiles.map((t, i) => `<button class="tile" data-i="${i}" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
        <div id="fb" class="stack"></div>
        <div class="row feedback-bar" id="actions"><button class="btn primary big" id="check" disabled>Vérifier</button></div></div>`;
      const ans = $("#ans"); const picked = [];
      const sync = () => { ans.innerHTML = picked.map((p, j) => `<button class="tile" data-j="${j}">${esc(p.t)}</button>`).join(""); $("#check").disabled = !picked.length;
        $$(".tile", ans).forEach((b) => b.addEventListener("click", () => { const p = picked.splice(+b.dataset.j, 1)[0]; $(`#tiles [data-i="${p.i}"]`).classList.remove("used"); sync(); })); };
      $$("#tiles .tile").forEach((b) => b.addEventListener("click", () => { if (b.classList.contains("used")) return; b.classList.add("used"); picked.push({ i: b.dataset.i, t: b.dataset.t }); play(b.dataset.t); sync(); }));
      const full = it.tokens.join("");
      $("#p").addEventListener("click", () => play(full)); $("#ps").addEventListener("click", () => play(full, true));
      $("#check").addEventListener("click", () => {
        const got = picked.map((p) => p.t).join(""); const right = got === full;
        if (right) { wr.ok++; addXP(5); }
        $("#fb").innerHTML = `<div class="reveal" style="background:${right ? "var(--good-soft)" : "var(--bad-soft)"}"><b>${right ? "Juste !" : "Pas tout à fait. La bonne phrase :"}</b><span class="lo say" data-t="${esc(full)}">${esc(it.tokens.join(" "))}</span><span class="rom">${esc(it.rom)}</span> · ${esc(it.fr)}</div>`;
        $("#actions").innerHTML = `<button class="btn primary big" id="nx">Continuer</button>`; $("#nx").addEventListener("click", () => { wr.i++; renderWrite(); }); $("#nx").focus();
        play(full);
      });
      setTimeout(() => { if (!$("#v-ecrire").hidden) play(full); }, 250);
    } else {
      v.innerHTML = `<div class="stack">${top}
        <p class="prompt">Écoute et écris en romanisation, avec les tons.</p>
        <div class="row"><button class="btn primary" id="p">▶ Écouter</button><button class="btn" id="ps">Ralenti</button><span class="muted">« ${esc(it.fr)} »</span></div>
        <div class="dict stack"><input id="in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ex. sa-bǎay-dǐi" aria-label="Ta dictée">
          <div class="keys" id="keys">
            ${[["̌", "ǎ", "montant"], ["́", "á", "haut"], ["̄", "ā", "moyen"], ["̀", "à", "bas"], ["̂", "â", "h. desc."], ["̏", "ȁ", "b. desc."]].map(([c, s, n]) => `<button data-c="${c}" title="Ton ${n}">${s}<small>${n}</small></button>`).join("")}
            <button data-ins="ɛ">ɛ<small>è</small></button><button data-ins="ɔ">ɔ<small>o ouvert</small></button><button data-ins="-">-<small>tiret</small></button>
          </div>
          <p class="muted" style="font-size:.85rem;margin:0">Tape la syllabe, puis touche un ton : il se pose sur la première voyelle de la syllabe.</p></div>
        <div id="fb"></div>
        <div class="row feedback-bar" id="actions"><button class="btn primary big" id="check">Vérifier</button></div></div>`;
      const inp = $("#in");
      $$("#keys button").forEach((b) => b.addEventListener("click", () => { if (b.dataset.ins) insertAt(inp, b.dataset.ins); else applyTone(inp, b.dataset.c); inp.focus(); }));
      $("#p").addEventListener("click", () => play(it.lao)); $("#ps").addEventListener("click", () => play(it.lao, true));
      const check = () => {
        const res = gradeRom(inp.value, it.rom); if (res.perfect) { wr.ok++; addXP(5); }
        $("#fb").innerHTML = `<div class="reveal"><b>${res.perfect ? "Parfait !" : res.segOk ? "Sons justes, revois les tons." : "Pas tout à fait."}</b><div style="margin:8px 0">${res.html}</div><span class="lo say" data-t="${esc(it.lao)}">${esc(it.lao)}</span><span class="rom">${esc(it.rom)}</span></div>`;
        $("#actions").innerHTML = `<button class="btn primary big" id="nx">Continuer</button>`; $("#nx").addEventListener("click", () => { wr.i++; renderWrite(); }); $("#nx").focus();
      };
      $("#check").addEventListener("click", check); inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && $("#check")) check(); });
      setTimeout(() => { if (!$("#v-ecrire").hidden) play(it.lao); }, 250);
    }
    bindMode();
  }
  function bindMode() { $$("#wmode button").forEach((b) => b.addEventListener("click", () => { wr.mode = b.dataset.m; RENDER.ecrire(); })); }
  function insertAt(inp, s) { const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a; inp.value = inp.value.slice(0, a) + s + inp.value.slice(b); inp.setSelectionRange(a + s.length, a + s.length); }
  function applyTone(inp, comb) {
    const pos = inp.selectionStart ?? inp.value.length; let v = inp.value.normalize("NFD");
    // syllabe courante = depuis le dernier séparateur avant le curseur
    const before = inp.value.slice(0, pos).normalize("NFD"); let start = Math.max(before.lastIndexOf(" "), before.lastIndexOf("-")) + 1;
    let end = start; while (end < v.length && !/[\s-]/.test(v[end])) end++;
    let syl = v.slice(start, end).replace(/[̀-ͯ]/g, "");
    const i = syl.search(/[aeiouɛɔ]/i); if (i < 0) { toast("Écris d'abord la syllabe"); return; }
    syl = syl.slice(0, i + 1) + comb + syl.slice(i + 1);
    const out = (v.slice(0, start) + syl + v.slice(end)).normalize("NFC"); inp.value = out;
    const caret = (v.slice(0, start) + syl).normalize("NFC").length; inp.setSelectionRange(caret, caret);
  }
  function splitSyl(s) { return s.normalize("NFD").toLowerCase().replace(/[.,!?…]/g, " ").split(/[\s-]+/).filter(Boolean).map((x) => ({ seg: x.replace(/[̀-ͯ]/g, ""), tone: (x.match(/[̀-ͯ]/) || [""])[0], raw: x.normalize("NFC") })); }
  function gradeRom(input, target) {
    const a = splitSyl(input), b = splitSyl(target); let segOk = a.length === b.length, perfect = segOk;
    const html = b.map((t, i) => {
      const u = a[i]; let cls = "ko", note = "manque";
      if (u) { if (u.seg !== t.seg) { cls = "ko"; note = "son"; segOk = false; perfect = false; } else if (u.tone !== t.tone) { cls = "tone"; note = "ton"; perfect = false; } else { cls = "ok"; note = "✓"; } }
      else { segOk = false; perfect = false; }
      return `<span class="syl ${cls}">${esc(u ? u.raw : "…")}<small>${note === "✓" ? "✓" : note + " → " + esc(t.raw)}</small></span>`;
    }).join("");
    if (a.length > b.length) perfect = false;
    return { html, segOk, perfect };
  }

  /* ---------------- démarrage ---------------- */
  async function loadJSON(u) { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error(u); return r.json(); }
  async function boot() {
    renderStreak();
    try {
      const [idx, audio] = await Promise.all([loadJSON("lessons.json"), loadJSON("sounds.json").catch(() => ({}))]);
      AUDIO = audio;
      LESSONS = (await Promise.all(idx.lessons.map((x) => loadJSON(x.file).then((d) => Object.assign({ id: x.id, num: x.num }, d))))).sort((a, b) => a.num - b.num);
    } catch (e) { $("#v-accueil").innerHTML = `<div class="panel">Impossible de charger les leçons. Vérifie ta connexion puis recharge.</div>`; return; }
    updateDueDot();
    const v = (location.hash || "#accueil").slice(1); go(VIEWS.includes(v) ? v : "accueil");
    const origRenderSpeak = renderSpeak; // étalonnage du ton moyen en tâche de fond
    setTimeout(() => { const l = currentLesson(); sp.l = sp.l || LESSONS.filter((x) => (x.speak || []).length).find((x) => x.id === (l || {}).id); warmMid(); }, 800);
    void origRenderSpeak;
  }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  boot();
})();
