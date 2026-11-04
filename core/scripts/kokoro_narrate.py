#!/usr/bin/env python3
"""kokoro_narrate.py — synthesize narration takes with Kokoro, with silence we control.

Reads one JSON job from stdin:
  { "model": ..., "voices": ..., "voice": "af_heart" | "af_heart:0.7,af_bella:0.3", "speed": 0.93,
    "lang": "en-us", "jobs": [ { "out": "a.wav", "pieces": [ { "text": "...", "gap": 0.4 }, ... ] } ] }
and prints { "voice": ..., "takes": [ { "out": ..., "duration": seconds, "pieces": [ { speaker, text, start, end } ] } ] }.
A piece may carry its own "voice", "speed" and "speaker" (a skit's cast); the job's voice is the default.

Why this exists: `hyperframes tts` exposes only voice and speed, and Kokoro's own sentence_pause did
nothing in testing (0.25 and 0.55 gave identical audio). So each piece is synthesized alone and the
silence after it is inserted here, which also lets the caller vary it.
"""
import json
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro


def die(msg, code=2):
    print(f"kokoro_narrate: {msg}", file=sys.stderr)
    sys.exit(code)


def resolve_voice(k, spec):
    """A voice id, or a weighted blend 'id:weight,id:weight' of voice style vectors."""
    known = set(k.get_voices())
    parts = [p.strip() for p in spec.split(",") if p.strip()]
    if not parts:
        die("no voice given")
    pairs = []
    for p in parts:
        name, _, w = p.partition(":")
        if name not in known:
            die(f"unknown voice '{name}'. Known: {', '.join(sorted(known))}")
        pairs.append((name, float(w) if w else 1.0))
    if len(pairs) == 1:
        return pairs[0][0]
    total = sum(w for _, w in pairs)
    return sum(k.get_voice_style(n) * (w / total) for n, w in pairs)


def main():
    req = json.load(sys.stdin)
    k = Kokoro(req["model"], req["voices"])
    voice = resolve_voice(k, req["voice"])
    speed = float(req.get("speed", 1.0))
    lang = req.get("lang", "en-us")
    takes = []
    styles = {req["voice"]: voice}  # a piece may name its own voice (a skit's cast); each is resolved once
    for job in req["jobs"]:
        sr = 24000
        lead = float(job.get("lead") or 0)
        chunks, at, spans = [], 0, []
        if lead > 0:
            chunks.append(np.zeros(int(lead * sr), dtype=np.float32))
            at = len(chunks[0])
        for piece in job["pieces"]:
            text = piece["text"].strip()
            if not text:
                continue
            spec = piece.get("voice") or req["voice"]
            if spec not in styles:
                styles[spec] = resolve_voice(k, spec)
            samples, sr = k.create(text, voice=styles[spec], speed=float(piece.get("speed") or speed), lang=lang)
            chunks.append(samples)
            spans.append({"speaker": piece.get("speaker"), "text": text,
                          "start": round(at / sr, 3), "end": round((at + len(samples)) / sr, 3)})
            at += len(samples)
            gap = float(piece.get("gap") or 0)
            if gap > 0:
                chunks.append(np.zeros(int(gap * sr), dtype=np.float32))
                at += int(gap * sr)
        if not spans:
            die(f"nothing to say for {job['out']}")
        audio = np.concatenate(chunks)
        sf.write(job["out"], audio, sr, subtype="PCM_16")
        takes.append({"out": job["out"], "duration": round(len(audio) / sr, 3), "pieces": spans})
    print(json.dumps({"voice": req["voice"], "takes": takes}))


if __name__ == "__main__":
    main()
