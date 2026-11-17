#!/usr/bin/env python3
"""script.json -> <lang>/<clip>.mp3 with edge-tts (24 kHz, 48 kbps mono mp3, silence-trimmed).

  python3 gen.py                 # all languages, all clips
  python3 gen.py --lang en       # one language
  python3 gen.py --only aimon,nano
  python3 gen.py --check         # only print durations vs. budget
  python3 gen.py --out DIR       # write <lang>/<clip>.mp3 under DIR (default: next to this file)

Needs edge-tts (pip install edge-tts), ffmpeg and ffprobe on PATH.

Truncation guard: edge-tts can silently return a shortened clip. After each synthesis the
last subtitle cue must contain the tail of the text; otherwise retry (max 3).
Writes manifest.json (durations per lang/clip) next to this file.
"""
import argparse, json, pathlib, re, subprocess, sys, tempfile, unicodedata

HERE = pathlib.Path(__file__).resolve().parent
RETRIES = 3


def dur(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", str(p)], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def letters(s):
    return "".join(ch for ch in s if unicodedata.category(ch)[0] in "LN").lower()


def last_cue(vtt):
    if not vtt.exists():
        return ""
    for b in reversed(re.split(r"\n\s*\n", vtt.read_text(encoding="utf-8").strip())):
        lines = [l for l in b.splitlines() if l.strip()]
        for i, l in enumerate(lines):
            if "-->" in l:
                return " ".join(lines[i + 1:])
    return ""


TRIM = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,"
        "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse")


def trim(mp3):
    """Cut edge-tts' ~0.2 s lead-in and ~0.7 s tail so the clip fits its product window; 48 kbps mono mp3."""
    tmp = mp3.with_suffix(".tmp.mp3")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-af", TRIM, "-ac", "1", "-ar", "24000",
                    "-c:a", "libmp3lame", "-b:a", "48k", "-map_metadata", "-1", "-id3v2_version", "0", str(tmp)], check=True)
    tmp.replace(mp3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang")
    ap.add_argument("--only")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--out", help="output directory for <lang>/<clip>.mp3")
    a = ap.parse_args()
    d = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
    budget = d["budget_s"]
    only = set(a.only.split(",")) if a.only else None
    OUT = pathlib.Path(a.out).resolve() if a.out else HERE
    VTT = pathlib.Path(tempfile.mkdtemp(prefix="narration-vtt-"))  # subtitles are only used for the truncation guard
    mpath = HERE / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() else {}
    bad = []
    for lang, cfg in d["langs"].items():
        if a.lang and lang != a.lang:
            continue
        out = OUT / lang
        out.mkdir(parents=True, exist_ok=True)
        for key, text in cfg["clips"].items():
            mp3, vtt = out / f"{key}.mp3", VTT / lang / f"{key}.vtt"
            vtt.parent.mkdir(parents=True, exist_ok=True)
            if not a.check and (only is None or key in only):
                tail = letters(text)[-4:]
                for attempt in range(RETRIES):
                    r = subprocess.run(["edge-tts", "-v", cfg["voice"], f"--rate={cfg['rate']}", "-t", text,
                                        "--write-media", str(mp3), "--write-subtitles", str(vtt)],
                                       capture_output=True, text=True)
                    if r.returncode == 0 and tail in letters(last_cue(vtt)):
                        break
                    print(f"  ! {lang}/{key} attempt {attempt + 1} failed: {(r.stderr or '')[-200:]} cue={last_cue(vtt)!r}")
                trim(mp3)
            D = dur(mp3)
            manifest.setdefault(lang, {})[key] = round(D, 2)
            ok = D <= budget[key]
            if not ok:
                bad.append(f"{lang}/{key}")
            print(f"  {'ok ' if ok else 'OVER'} {lang:5} {key:10} {D:5.2f}s / {budget[key]:4.1f}s")
    mpath.write_text(json.dumps(manifest, indent=1))
    if bad:
        sys.exit(f"over budget: {bad}")


if __name__ == "__main__":
    main()
