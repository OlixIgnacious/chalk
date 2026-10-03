tw=0
for seg,scenes in S.items():
    out=[]
    for i,(title,visual,example,entries) in enumerate(scenes,1):
        words=sum(len(strip(e[0]).split()) for e in entries)
        marks=sum(GAP[m] for e in entries for m in re.findall(r"\{(beat|pause|think)\}",e[0]))
        dur=max(4,math.ceil(words/2.0+marks+1)); tw+=words
        out.append(f"## Scene {i} — {title}\nvisual: {visual} (tier 1)\n"+(f"example: {example}\n" if example else "")+f"duration: ~{dur}s\n")
        for sp,src in entries:
            out.append(f'- spoken: "{sp}"\n  display: "{disp(sp)}"\n  source: [{", ".join(src)}]\n')
    os.makedirs(O+f"segments/{seg}",exist_ok=True)
    open(O+f"segments/{seg}/script.md","w").write("\n".join(out))
print("total spoken words:",tw)
