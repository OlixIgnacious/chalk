from framelib import *


def f1(F):
    F.headline("keep one running total", "Keep", y=180, size=84)
    cells = F.cells([2, 5, 1], 104, 380, size=150, gap=22, font_size=80)
    t = F.cue("2, 5, 1")
    for i, c in enumerate(cells):
        F.pop(c, t + i * 0.3)
    F.rise(F.text("add each value once", 104, 600, size=60, weight=700, eid=f"{F.id}-rule"), "Add")
    F.pop(F.text("total 8", 760, 410, size=110, weight=800, color=ORANGE, eid=f"{F.id}-tot"), "8")


FRAMES = {1: f1}
