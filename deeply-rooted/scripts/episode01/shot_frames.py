"""Print Episode 01 shot boundaries (mirrors src/episode01/Episode01.tsx) — for review stills and chunked renders."""
import json, os, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
P = json.load(open(os.path.join(ROOT, "src/data/episode01/placement.json")))
T = json.load(open(os.path.join(ROOT, "src/data/narration_new_transcript.json")))["phrases"]
def fr(t):
    for s in P["segments"]:
        if s["src"][0] - 1e-6 <= t <= s["src"][1] + 1e-6:
            x = (s["at"] + t - s["src"][0]) * 30
            return int(x + 0.5) if x >= 0 else -int(-x + 0.5)
ps = lambda i: fr(T[i]["start"]); pe = lambda i: fr(T[i]["end"])
cut = lambda i: int((pe(i - 1) + ps(i)) / 2 + 0.5)
starts = [0, fr(5.3), fr(7.767)] + [cut(i) for i in (5, 11, 17, 19, 22, 24, 29, 31, 40, 42, 46, 51, 54, 59, 63, 66, 70, 77, 80, 84, 87, 91, 95, 100, 102, 108, 112, 115, 119)]
ends = starts[1:] + [P["frames"]]
if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "table"
    if mode == "mids":
        print(" ".join(str((a + b) // 2) for a, b in zip(starts, ends)))
    else:
        for i, (a, b) in enumerate(zip(starts, ends), 1):
            print(f"{i:2d} {a:5d}-{b:5d} ({(b - a) / 30:5.1f}s)  {a // 1800}:{a / 30 % 60:05.2f}")
