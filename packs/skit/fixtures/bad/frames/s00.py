# The bad skit's frame spec: a close-up from the first frame, so no one sees who else is there or where.
FRAMES = {}

def scene(F):
    S = F.stage(cast=("penguin", "bear"))
    S.shot("penguin", 0)
    S.shot("two", 4.0)
