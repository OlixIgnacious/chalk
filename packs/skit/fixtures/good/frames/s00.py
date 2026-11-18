# The skit fixture's frame spec: open wide so both characters and the board are seen, then cut in.
FRAMES = {}

def scene(F):
    S = F.stage(cast=("penguin", "bear"))
    S.shot("two", 0)
    S.shot("bear", 3.2)
    S.shot("two", 6.0, push=True)
