"""Générateur de leçons du Cahier de lao.

Chaque leçon est écrite dans un format compact (fichiers partie_*.py, liste LESSONS).
Les phrases lao sont écrites en mots séparés par « | » : le générateur les assemble,
calcule la romanisation à partir du lexique (lexique.py) et produit le fichier lNN.json
que lit l'application (sections, exercices, cartes, sons).

Lancer :  python3 redaction/build.py
"""
import glob, html, importlib.util, json, os, random, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lexique import LEX, PEOPLE  # noqa: E402

PROG = json.load(open(os.path.join(ROOT, "programme.json"), encoding="utf-8"))
NUM2PART = {x["num"]: p for p in PROG["parts"] for x in p["lessons"]}
NUM2FICHE = {x["num"]: x for p in PROG["parts"] for x in p["lessons"]}
missing = set()

def esc(s):
    return html.escape(str(s), quote=True)

def toks(s):
    return [t for t in s.split("|") if t != ""]

PUNCT = set("?!.,…")

def lao(s):
    """« ສະບາຍດີ|ບໍ|? » → texte lao affiché (sans séparateurs, espace entre les phrases)."""
    tl = [t.strip() for t in toks(s)]
    out = ""
    for i, t in enumerate(tl):
        last = i == len(tl) - 1
        if t in ("?", "!"):
            out += t + ("" if last else " ")
        elif t in (".", ",", "…"):
            out += "" if last else " "
        elif t == "_":
            out += " "
        else:
            out += t.rstrip("_")
    return re.sub(r"\s+", " ", out).strip()

def rom(s):
    words = []
    for t in toks(s):
        t = t.strip()
        if t in PUNCT:
            if words:
                words[-1] += t
            continue
        if t == "_":
            continue
        if t in LEX:
            words.append(LEX[t])
        elif t in PEOPLE:
            words.append(PEOPLE[t][1])
        else:
            missing.add(t)
            words.append("?" + t)
    out = " ".join(words)
    out = re.sub(r"([.?!] )(\w)", lambda m: m.group(1) + m.group(2).upper(), out)
    return out[:1].upper() + out[1:] if out else out

def who(code):
    if code in PEOPLE:
        return PEOPLE[code][0]
    return code

def cleankey(s):
    return re.sub(r"\s+", " ", re.sub(r'[…!?.,«»"]', " ", s)).strip()

def say(s, size=None):
    t = lao(s)
    st = f' style="font-size:{size}"' if size else ""
    return f'<span class="lo"{st}>{esc(t)}</span>'

def lesson_json(L, all_specs):
    n = L["n"]
    part = NUM2PART[n]
    fiche = NUM2FICHE[n]
    show_rom = n <= 30
    rnd = random.Random(n * 7919)
    sounds = {}

    def addsound(s):
        t = lao(s).replace(" ", " ")
        if re.search("[຀-໿]", t):
            sounds[t] = rom(s)

    S = []
    S.append(("Avant de commencer", '<p class="note warn"><b>Brouillon.</b> Cette leçon est une première version complète, pas encore vérifiée par un natif. Les tons et les tournures marqués [À VÉRIFIER] sont à confirmer.</p>'))
    # 1. révision espacée
    prev = {x["n"]: x for x in all_specs}
    rev = []
    for d in (1, 3, 7, 14):
        p = prev.get(n - d)
        if p and p.get("voc"):
            it = rnd.choice(p["voc"])
            rev.append((d, it))
    if rev:
        items = "".join(f'<li>{esc(it[1])} <small class="muted">(leçon {n - d})</small></li>' for d, it in rev)
        ans = "".join(f'<li>{say(it[0])} <span class="rom">{esc(rom(it[0]))}</span> · {esc(it[1])}</li>' for d, it in rev)
        S.append(("Révision espacée", f'<p>Dis à voix haute, sans regarder la réponse :</p><ol>{items}</ol><details><summary>Réponses</summary><ol>{ans}</ol></details>'))
        for d, it in rev:
            addsound(it[0])
    # 2. objectif
    S.append(("Objectif", f'<p>{esc(L["obj"])}</p>' + (f'<p class="note">{L["intro"]}</p>' if L.get("intro") else "")))
    # 3. dialogue
    if L.get("dia"):
        lines = []
        for c, s, fr in L["dia"]:
            addsound(s)
            r = f'<span class="rom">{esc(rom(s))}</span>' if show_rom else ""
            lines.append(f'<div class="line"><span class="who">{esc(who(c))}</span><div><span class="lo">{esc(lao(s))}</span>{r}</div></div>')
        tr = "<br>".join(f'<b>{esc(PEOPLE.get(c, (c, c, c))[2] if c in PEOPLE else c)}</b> — {esc(fr)}' for c, s, fr in L["dia"])
        romdet = "" if show_rom else '<details><summary>Romanisation (mots nouveaux)</summary><p>' + "<br>".join(f'<span class="rom">{esc(rom(s))}</span>' for c, s, fr in L["dia"]) + "</p></details>"
        S.append(("Dialogue", (f'<p class="muted">{esc(L["scene"])}</p>' if L.get("scene") else "") + '<div class="dialogue">' + "".join(lines) + "</div>" + romdet + f'<details><summary>Traduction (seulement après avoir cherché)</summary><p>{tr}</p></details>'))
    # 4. compréhension
    if L.get("ce"):
        qs = "".join(f"<li>{esc(q)}</li>" for q, a in L["ce"])
        an = "".join(f"<li>{esc(a)}</li>" for q, a in L["ce"])
        S.append(("Compréhension", f"<ol>{qs}</ol><details><summary>Réponses</summary><ol>{an}</ol></details>"))
    # 5. vocabulaire
    if L.get("voc"):
        rows = '<tr><th>Lao</th><th>Romanisation</th><th>Sens</th><th>À retenir</th></tr>'
        for it in L["voc"]:
            s, fr = it[0], it[1]
            note = it[2] if len(it) > 2 else ""
            addsound(s)
            rows += f'<tr><td class="lo">{esc(lao(s))}</td><td class="rom">{esc(rom(s))}</td><td>{esc(fr)}</td><td>{esc(note)}</td></tr>'
        S.append(("Vocabulaire et blocs", f'<div class="tbl"><table>{rows}</table></div>' + (f'<p class="note">{L["cult"]}</p>' if L.get("cult") else "")))
    # 6. point de langue
    g = L.get("gram")
    if g:
        ex = ""
        for s, fr in g.get("ex", []):
            addsound(s)
            ex += f'<li><span class="lo">{esc(lao(s))}</span> <span class="rom">{esc(rom(s))}</span> = {esc(fr)}</li>'
        qs = "".join(f"<li>{esc(q)}</li>" for q in g.get("q", []))
        S.append(("Point de langue : " + g["t"], f'<p>Observe ces exemples :</p><ul>{ex}</ul>' + (f"<p><b>À toi de trouver :</b></p><ol>{qs}</ol>" if qs else "") + f'<details><summary>La règle</summary><p>{g["rule"]}</p></details>'))
    # 7. écoute
    S.append(("Écoute", f'<p>Dans l\'onglet <b>Écouter</b>, trois exercices sur cette leçon : le vocabulaire, le dialogue réplique par réplique, et les phrases du « Comment tu dirais ».</p>' + (f'<p class="note"><b>Ce que tu écoutes :</b> {esc(L["co"])}</p>' if L.get("co") else "")))
    # 8. expression orale
    if L.get("ant"):
        q = "".join(f"<li>{esc(fr)}</li>" for fr, s in L["ant"])
        a = ""
        for fr, s in L["ant"]:
            addsound(s)
            a += f'<li><span class="lo">{esc(lao(s))}</span> <span class="rom">{esc(rom(s))}</span></li>'
        rp = ""
        if L.get("rp"):
            c, s, fr = L["rp"]
            addsound(s)
            rp = f'<p><b>C. Jeu de rôle.</b> Réponds à voix haute, puis écris ta réponse à Claude :</p><div class="line"><span class="who">{esc(who(c))}</span><div><span class="lo">{esc(lao(s))}</span>' + (f'<span class="rom">{esc(rom(s))}</span>' if show_rom else "") + f'</div></div><p class="muted">({esc(fr)})</p>'
        S.append(("Expression orale", f'<p><b>A. Comment tu dirais… ?</b> Construis la phrase sans regarder le corrigé.</p><ol>{q}</ol><details><summary>Corrigé</summary><ol>{a}</ol></details><p><b>B. Shadowing (5 min).</b> Dans l\'onglet Parler, écoute chaque phrase et répète en même temps que la voix. Puis fais vérifier ta prononciation par la machine.</p>{rp}'))
    # 9. expression écrite
    if L.get("ee"):
        S.append(("Expression écrite", "<ol>" + "".join(f"<li>{esc(x)}</li>" for x in L["ee"]) + "</ol>"))
    # 10. tâche
    S.append(("Tâche finale", f'<p>{esc(L.get("task", fiche["task"]))}</p>'))

    # cartes
    cards = []
    for i, it in enumerate(L.get("voc", [])):
        cards.append({"id": f"l{n:02d}-v{i+1:02d}", "front": lao(it[0]), "back": f"{rom(it[0])} · {it[1]}"})
    for i, (fr, s) in enumerate(L.get("ant", [])):
        cards.append({"id": f"l{n:02d}-p{i+1:02d}", "front": fr, "back": f"{lao(s)} · {rom(s)}"})
    S.append(("Cartes de révision", f"<p>{len(cards)} cartes ajoutées à l'onglet <b>Réviser</b> : le vocabulaire (lao → sens) et les phrases à produire (français → lao).</p>"))

    # exercices d'écoute
    listening = []
    voc = L.get("voc", [])
    if len(voc) >= 4:
        qs = []
        for s, fr, *_ in voc:
            others = [v[1] for v in voc if v[1] != fr]
            rnd.shuffle(others)
            qs.append({"audio": [lao(s)], "prompt": "Ça veut dire…", "options": [fr] + others[:3], "answer": fr, "reveal": f"<i>{esc(rom(s))}</i>"})
        listening.append({"title": "Qu'est-ce que ça veut dire ?", "subtitle": "Le vocabulaire, sans le voir", "instructions": "Tu entends un mot ou un bloc de la leçon. Choisis son sens.", "questions": qs})
    dia = L.get("dia", [])
    if len(dia) >= 4:
        qs = []
        for c, s, fr in dia:
            others = [d[2] for d in dia if d[2] != fr]
            rnd.shuffle(others)
            qs.append({"audio": [lao(s)], "prompt": "Cette réplique veut dire…", "options": [fr] + others[:3], "answer": fr, "reveal": f"<i>{esc(rom(s))}</i>"})
        listening.append({"title": "Le dialogue, à l'oreille", "subtitle": "Réplique par réplique", "shuffle": False, "instructions": "Écoute chaque réplique du dialogue sans le texte et choisis sa traduction.", "questions": qs})
    ant = L.get("ant", [])
    if len(ant) >= 3:
        qs = []
        for fr, s in ant:
            others = [a[0] for a in ant if a[0] != fr]
            rnd.shuffle(others)
            qs.append({"audio": [lao(s)], "prompt": "Quelle phrase entends-tu ?", "options": [fr] + others[:3], "answer": fr, "reveal": f"<i>{esc(rom(s))}</i>"})
        listening.append({"title": "Les phrases clés", "subtitle": "Reconnaître les phrases à produire", "instructions": "Écoute la phrase et retrouve sa traduction.", "questions": qs})

    if L.get("tones"):
        names = [t[1] for t in L["tones"]]
        qs = []
        for _ in range(2):
            for s_, tn, fr in L["tones"]:
                addsound(s_)
                qs.append({"audio": [lao(s_)], "prompt": "Quel ton entends-tu ?", "options": names, "fixed": True, "answer": tn, "reveal": f"<i>{esc(rom(s_))}</i> · ton {tn.lower()} · {esc(fr)}"})
        listening.insert(0, {"title": "Quel ton ?", "subtitle": "Les 6 tons, dans le désordre", "instructions": "Écoute seulement la mélodie : ça monte, ça descend ou c'est plat ?", "questions": qs})
    speak = [{"lao": lao(s), "rom": rom(s), "fr": fr, "kind": "tone", "tone": tn.lower()} for s, tn, fr in L.get("tones", [])]
    speak += [{"lao": lao(s), "rom": rom(s), "fr": fr, "kind": "phrase"} for s, fr, *_ in voc] + [{"lao": lao(s), "rom": rom(s), "fr": fr, "kind": "phrase"} for fr, s in ant]
    build = [{"tokens": [t.rstrip("_") for t in toks(s) if t not in PUNCT and t != "_"], "rom": rom(s), "fr": fr} for fr, s in ant if len([t for t in toks(s) if t not in PUNCT]) >= 2]
    for b in build:
        sounds[cleankey("".join(b["tokens"]))] = b["rom"]
        for t in b["tokens"]:
            sounds[t] = LEX.get(t) or LEX.get(t + "_") or ""
    write = [{"lao": lao(s), "rom": rom(s), "fr": fr} for s, fr, *_ in voc]

    vocab_line = ", ".join(rom(it[0]) for it in voc)
    nxt = NUM2FICHE.get(n + 1)
    suivi = (f"LEÇON : {n} — Partie {part['key']} ({part['title']}, {part['level']}) · {L['title']}\n"
             f"OBJECTIF : {L['obj']}\n"
             f"NOTION : {g['t'] if g else '—'}\n"
             f"VOCAB : {vocab_line}\n"
             f"ERREURS RÉCURRENTES : (à remplir)\n"
             f"PROCHAINE : " + (f"Leçon {nxt['num']} — {nxt['title']}" if nxt else "fin du parcours"))
    return {
        "num": n, "phase": f"Partie {part['key']} · {part['title']}", "title": L["title"], "objective": L["obj"], "draft": True,
        "sections": [{"title": t, "html": h} for t, h in S], "cards": cards, "listening": listening,
        "speak": speak, "build": build, "write": write,
        "sounds": {cleankey(k): v for k, v in sounds.items() if cleankey(k)}, "suivi": suivi,
    }

def load_specs():
    specs = []
    for path in sorted(glob.glob(os.path.join(HERE, "partie_*.py"))):
        spec = importlib.util.spec_from_file_location(os.path.basename(path)[:-3], path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        specs.extend(mod.LESSONS)
    return sorted(specs, key=lambda x: x["n"])

if __name__ == "__main__":
    specs = load_specs()
    written = []
    for L in specs:
        d = lesson_json(L, specs)
        json.dump(d, open(os.path.join(ROOT, f"l{L['n']:02d}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        written.append(L["n"])
    # index des leçons : la leçon 0 (écrite à la main) + toutes les leçons générées
    idx = {"lessons": [{"id": "l00", "num": 0, "title": "L'alphabet lao", "phase": "Partie A · Fondations", "file": "l00.json"}]}
    for n in written:
        f = NUM2FICHE[n]
        idx["lessons"].append({"id": f"l{n:02d}", "num": n, "title": f["title"], "phase": NUM2PART[n]["title"], "file": f"l{n:02d}.json"})
    json.dump(idx, open(os.path.join(ROOT, "lessons.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if missing:
        print("MOTS ABSENTS DU LEXIQUE :", " ".join(sorted(missing)))
        sys.exit(1)
    print(f"{len(written)} leçons générées")
