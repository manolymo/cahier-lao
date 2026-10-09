"""Génère les voix lao naturelles (voix de lecture à voix haute de Microsoft Edge,
via l'outil communautaire edge-tts) pour toutes les phrases des leçons.

Lancé automatiquement par GitHub Actions à chaque ajout de leçon.
Ne régénère que les sons manquants. Aucune clé ni compte requis."""
import asyncio, glob, json, os, re, sys

import edge_tts

VOICE_F = "lo-LA-KeomanyNeural"     # voix féminine
VOICE_M = "lo-LA-ChanthavongNeural" # voix masculine
ROOT = os.path.dirname(os.path.abspath(__file__))
IDX = os.path.join(ROOT, "sounds.json")

def clean(s):
    return re.sub(r"\s+", " ", re.sub(r'[…!?.,«»"]', " ", s)).strip()

def djb2(s):
    h = 5381
    for ch in s:
        h = ((h << 5) + h + ord(ch)) & 0xFFFFFFFF
    return "a" + format(h, "x")

def lesson_texts():
    texts = set()
    for path in sorted(glob.glob(os.path.join(ROOT, "l*.json"))):
        if not re.fullmatch(r"l\d+\.json", os.path.basename(path)):
            continue
        d = json.load(open(path, encoding="utf-8"))
        texts.update(d.get("sounds", {}).keys())
    return {clean(t) for t in texts if clean(t) and re.search("[຀-໿]", t)}

async def one(text, voice, out):
    # pauses plus nettes entre les mots pour l'apprentissage
    await edge_tts.Communicate(text, voice, rate="-10%").save(out)

async def main():
    idx = json.load(open(IDX, encoding="utf-8")) if os.path.exists(IDX) else {}
    todo = []
    for t in sorted(lesson_texts()):
        k = djb2(t)
        e = idx.setdefault(k, {"text": t})
        e["text"] = t
        for tag, voice in (("f", VOICE_F), ("m", VOICE_M)):
            rel = f"audio/{tag}/{k}.mp3"
            if e.get(tag) and os.path.exists(os.path.join(ROOT, rel)):
                continue
            todo.append((t, voice, rel, e, tag))
    print(f"{len(todo)} sons à générer")
    ok = fail = 0
    for t, voice, rel, e, tag in todo:
        out = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        for attempt in range(3):
            try:
                await one(t, voice, out)
                if os.path.getsize(out) < 500:
                    raise RuntimeError("fichier vide")
                e[tag] = rel; ok += 1
                break
            except Exception as err:  # réessaie puis passe
                if attempt == 2:
                    print("ÉCHEC", t, voice, err); fail += 1
                    if os.path.exists(out): os.remove(out)
                await asyncio.sleep(2)
    json.dump(idx, open(IDX, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"OK {ok} · échecs {fail}")
    if fail and not ok:
        sys.exit(1)

asyncio.run(main())
