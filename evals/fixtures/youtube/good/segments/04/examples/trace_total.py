# Trace total on [2, 5, 1] by running it, and check the result against the walkthrough table.
import json, sys

def total(nums):
    s = 0
    for x in nums:
        s += x
    return s

steps = []

def tracer(frame, event, arg):
    if frame.f_code.co_name != "total":
        return None
    if event in ("line", "return"):
        steps.append({"line": frame.f_lineno - frame.f_code.co_firstlineno + 1, "locals": {k: (list(v) if isinstance(v, list) else v) for k, v in frame.f_locals.items()}})
    return tracer

sys.settrace(tracer)
result = total([2, 5, 1])
sys.settrace(None)
after = [s["locals"]["s"] for s in steps if s["line"] == 3]
assert after == [0, 2, 7, 8], after
print(json.dumps({"result": result, "steps": steps}))
