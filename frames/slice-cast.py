"""slice-cast.py — a character sheet into one image per pose, for framelib's stage (F.stage / F.pose).

    python -I frames/slice-cast.py cast.json            (paths in cast.json are relative to it)

cast.json:
    { "sheet": "sheet.jpg", "out": "cast", "scale": 4,
      "rows": [ { "char": "penguin", "poses": ["neutral", "happy", …] }, … ] }

A sheet is a grid on a plain board: bands of art, each with a strip of printed labels under it. The bands and the
cells inside them are found from the ink, so nothing is measured by hand; a row whose cell count differs from
its pose list stops the run. Every pose of one character is put on the same canvas, centred, its art standing
on the canvas's bottom edge, so swapping poses never moves the feet. The board around the art is cut away
(the board is flooded in from the edges and stops at the chalk outline, so the penguin's black body, inside its
outline, is kept), so a character stands on any stage without a box around it.

Writes <out>/<char>/<pose>.png, <out>/cast-meta.json (board colour, canvas size per character) and
<out>/contact.png, a labelled grid to check the crops by eye.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

INK = 70        # luminance above this is chalk
PAD = 6         # px of board kept above and beside the art, in sheet pixels
BARRIER = 62    # luminance the board flood cannot cross: the chalk outline


def runs(mask, min_gap):
    """[(start, end)] of True runs, joining runs separated by fewer than min_gap Falses."""
    out = []
    for i, on in enumerate(mask):
        if not on:
            continue
        if out and i - out[-1][1] <= min_gap:
            out[-1][1] = i
        else:
            out.append([i, i])
    return [tuple(r) for r in out]


def bands(lum):
    """Art bands: the tall runs of inked rows (the short ones under them are the printed labels)."""
    rows = runs((lum > INK).sum(1) > 3, min_gap=1)  # a label strip can sit 1px under its art
    tall = [r for r in rows if r[1] - r[0] > 40]
    return tall


def cells(lum, band):
    a, b = band
    return runs((lum[a:b + 1] > INK).sum(0) > 1, min_gap=12)


def shift_or(m):
    """m grown by one pixel in the four directions."""
    g = m.copy()
    g[1:] |= m[:-1]
    g[:-1] |= m[1:]
    g[:, 1:] |= m[:, :-1]
    g[:, :-1] |= m[:, 1:]
    return g


def flood(lum, grow):
    """The board reached from the top and side edges, across pixels the grown outline does not cover. Seeded from
    the top and sides only: the bottom edge is the floor the art stands on, and a penguin's outline is open between
    its feet, so a flood from below would empty its body."""
    bar = lum >= BARRIER
    for _ in range(grow):  # a JPEG'd chalk line has gaps the flood would find
        bar = shift_or(bar)
    board = ~bar
    reach = np.zeros_like(board)
    reach[0, :], reach[:, 0], reach[:, -1] = board[0, :], board[:, 0], board[:, -1]
    while True:
        nxt = shift_or(reach) & board
        if (nxt == reach).all():
            return reach
        reach = nxt


def cutout(lum):
    """The character's alpha: everything the board cannot reach, so the penguin's black body, inside its outline,
    stays. The outline is closed one pixel at a time until the kept area stops jumping: a jump means the flood
    was still getting in through a gap and emptying the body."""
    kept = [~flood(lum, g) for g in (1, 2, 3, 4)]
    for a, b in zip(kept, kept[1:]):
        if b.mean() - a.mean() < 0.04:
            return a  # with the pixels of board around the outline: its soft edge
    return kept[-1]


def main():
    spec_path = Path(sys.argv[1]).resolve()
    spec = json.loads(spec_path.read_text())
    base = spec_path.parent
    sheet = Image.open(base / spec["sheet"]).convert("RGB")
    rgb = np.asarray(sheet)
    lum = np.asarray(sheet.convert("L")).astype(int)
    board = tuple(int(v) for v in np.median(rgb.reshape(-1, 3), axis=0))
    scale = int(spec.get("scale", 4))
    out = base / spec.get("out", "cast")

    found = bands(lum)
    if len(found) != len(spec["rows"]):
        sys.exit(f"slice-cast: {len(found)} art bands in the sheet, {len(spec['rows'])} rows in cast.json")
    crops = {}  # char -> [(pose, (x0, y0, x1, y1))]
    for band, row in zip(found, spec["rows"]):
        cs = cells(lum, band)
        if len(cs) != len(row["poses"]):
            sys.exit(f"slice-cast: band {band} has {len(cs)} cells, cast.json names {len(row['poses'])}: {row['poses']}")
        for (x0, x1), pose in zip(cs, row["poses"]):
            sub = lum[band[0]:band[1] + 1, x0:x1 + 1] > INK
            ys = np.where(sub.any(1))[0]
            crops.setdefault(row["char"], []).append((pose, tuple(int(v) for v in (x0, band[0] + ys[0], x1 + 1, band[0] + ys[-1] + 1))))

    meta = {"board": "#%02x%02x%02x" % board, "scale": scale, "chars": {}}
    thumbs = []
    for char, items in crops.items():
        cw = max(b[2] - b[0] for _, b in items) + 2 * PAD
        ch = max(b[3] - b[1] for _, b in items) + PAD  # no padding under the art: the label strip can sit right below it
        W, H = cw * scale, ch * scale
        (out / char).mkdir(parents=True, exist_ok=True)
        for pose, (x0, y0, x1, y1) in items:
            canvas = Image.new("RGB", (cw, ch), board)
            art = sheet.crop((max(0, x0 - PAD), max(0, y0 - PAD), x1 + PAD, y1))
            canvas.paste(art, ((cw - art.width) // 2, ch - art.height))  # standing on the bottom edge
            keep = cutout(np.asarray(canvas.convert("L")).astype(int))
            alpha = Image.fromarray((keep * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(scale * 0.4))
            big = canvas.resize((W, H), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
            big.putalpha(alpha)
            big.save(out / char / f"{pose}.png")
            thumbs.append((f"{char}/{pose}", big))
        meta["chars"][char] = {"w": W, "h": H, "poses": [p for p, _ in items]}
    (out / "cast-meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    tw = 220
    cols = 10
    th = max(int(t.height * tw / t.width) for _, t in thumbs) + 28
    sheet_out = Image.new("RGB", (cols * tw, -(-len(thumbs) // cols) * th), (52, 84, 132))  # blue: a leak shows
    d = ImageDraw.Draw(sheet_out)
    for i, (name, t) in enumerate(thumbs):
        x, y = (i % cols) * tw, (i // cols) * th
        small = t.resize((tw, int(t.height * tw / t.width)))
        sheet_out.paste(small, (x, y), small)
        d.text((x + 6, y + th - 22), name, fill=(240, 236, 229))
    sheet_out.save(out / "contact.png")
    print(f"slice-cast: {len(thumbs)} poses for {', '.join(crops)} → {out} (board {meta['board']})")


if __name__ == "__main__":
    main()
