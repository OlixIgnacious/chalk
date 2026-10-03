# Step-4 helpers for a chalk-youtube output dir.   usage: CCARP_DIR=<dir>/ python3 pipeline.py <scaffold|storyboard|sync|align> [segment ...]
import json,os,re,shutil,subprocess,sys
import importlib
SPEC=importlib.import_module(os.environ.get("CCARP_SPEC","spec_ch2")).SPEC
R=os.environ["CCARP_DIR"]
CH1=os.environ.get("CCARP_ASSETS","")  # a built segment's assets/ dir holding fonts/ and gsap.min.js to stage
SK=os.path.expanduser(os.environ.get("FACELESS","~/.claude/skills/faceless-explainer/scripts"))+"/audio.mjs"
TITLES=json.load(open(R+"titles.json"))
CH=os.environ.get("CCARP_CH","2"); CHT=os.environ.get("CCARP_TITLE","Claude Models & Prompting")
MARK=re.compile(r"\{(beat|pause|think)\}")
def scenes(md):
    out=[];cur=None
    for line in md.split("\n"):
        m=re.match(r"##\s+(.*)",line)
        if m: cur={"title":m.group(1).split(" — ",1)[-1],"spoken":[],"dur":6};out.append(cur);continue
        m=re.match(r"duration:\s*~?([\d.]+)",line.strip())
        if m and cur: cur["dur"]=float(m.group(1))
        m=re.match(r'\s*-?\s*spoken:\s*"(.*)"\s*$',line)
        if m and cur: cur["spoken"].append(m.group(1))
    return out
segs=sys.argv[2:] or sorted(TITLES)
cmd=sys.argv[1]

if cmd=="scaffold":
    chapter_md=open(R+f"source/ccarp-ch{CH}.md").read()
    for seg in segs:
        P=R+f"segments/{seg}/video/"
        os.makedirs(P+"capture/extracted",exist_ok=True); os.makedirs(P+"assets/fonts",exist_ok=True)
        open(P+"capture/extracted/visible-text.txt","w").write(chapter_md)
        open(P+"capture/extracted/tokens.json","w").write(json.dumps({"title":CHT,"description":f"CCAR-P Chapter {CH}","colors":[],"fonts":[]}))
        for f in os.listdir(CH1+"fonts"):
            if f.startswith(("Barlow","IBMPlexMono")): shutil.copy(CH1+"fonts/"+f,P+"assets/fonts/"+f)
        shutil.copy(CH1+"gsap.min.js",P+"assets/gsap.min.js")
        open(P+"BRIEF.md","w").write(f"""---
workflow: faceless-explainer
flow: automation
storyboard: no
message: "CCAR-P Chapter {CH}, segment {seg}: {TITLES[seg]}."
destination: youtube
aspect: 1920x1080
language: en
angle: concept
style_preset: broadside
---

## Intent

Segment {seg} — "{TITLES[seg]}" — of a YouTube video built from CCAR-P Chapter {CH} ({CHT}),
for CCAR-P exam candidates. A teacher talking to one viewer; matches the existing Chapter 1 lessons.

## Notes

- Format is pinned: 1920x1080, 30fps. Delivery refuses anything else.
- Narration and on-screen copy are locked and grounded in the source (`../script.md`, block ids on every line).
- Series design preset: broadside, dark register only, the same in every segment.
- Every frame's duration equals its narration; only the last frame of the segment holds (~1.8s).
- No background music (`music: none`). No word budget and no length cap.
""")
        sc=scenes(open(R+f"segments/{seg}/script.md").read())
        out=[f"# SCRIPT — ccarp-ch{CH} / segment {seg}","","**Voice:** Kokoro (offline), via chalk-core narrate","**Voice direction:** a teacher talking to one viewer.","","---",""]
        for i,s in enumerate(sc,1): out+=[f"## Line {i} — {s['title']} (Frame {i})","","**Delivery:** Even, clear.","","    "+" ".join(s["spoken"]),""]
        open(P+"SCRIPT.md","w").write("\n".join(out))
        print(seg,len(sc),"frames scaffolded")

elif cmd=="storyboard":
    for seg in segs:
        sc=scenes(open(R+f"segments/{seg}/script.md").read()); spec=SPEC[seg]
        assert len(sc)==len(spec),(seg,len(sc),len(spec))
        est=sum(s["dur"] for s in sc)
        sb=["---","format: 1920x1080",f"duration: {est:.0f}s",f'message: "CCAR-P Chapter {CH} — {TITLES[seg]}"',"arc: "+" → ".join(s["title"] for s in sc),"audience: CCAR-P exam candidates","mode: autonomous","music: none","---",""]
        for i,(s,f) in enumerate(zip(sc,spec),1):
            vo=re.sub(r"\s+"," ",MARK.sub(" "," ".join(s["spoken"]))).replace('"',"'")
            kinds=", ".join(c["k"] for c in f["body"]) or "hero title"
            sb+=[f"## Frame {i} — {s['title']}","",f"- scene: {' '.join(f['head'])} ({kinds})",f"- duration: {s['dur']:.0f}s",
                 f"- transition_in: {'cut' if i==1 else 'crossfade 0.3s'}","- status: outline",f"- voiceover: \"{vo}\"",
                 f"- src: compositions/frames/f{i:02d}-{f['slug']}.html","",
                 f"Blueprint: compose. Dark broadside register. Tracker, label, headline `{' / '.join(f['head'])}`, then components ({kinds}) whose items reveal on the word that names them.",""]
        open(R+f"segments/{seg}/video/STORYBOARD.md","w").write("\n".join(sb))
        print(seg,len(sc),"frames, est",round(est),"s")

elif cmd=="sync":
    for seg in segs:
        P=R+f"segments/{seg}/video/"
        subprocess.run(["node",SK,"sync-durations","--audio-meta","./audio_meta.json","--storyboard","./STORYBOARD.md"],cwd=P,capture_output=True)
        m=json.load(open(P+"audio_meta.json")); last=m["voices"][-1]["duration_s"]
        t=open(P+"STORYBOARD.md").read(); parts=re.split(r"(?m)^(?=## Frame )",t)
        n=len([p for p in parts if p.startswith("## Frame ")])
        for i,s in enumerate(parts):
            if s.startswith(f"## Frame {n} "): parts[i]=re.sub(r"- duration: [\d.]+s",f"- duration: {round(last+1.8,3)}s",s,count=1)
        open(P+"STORYBOARD.md","w").write("".join(parts))
        print(seg,n,"frames",[l.split(": ")[1] for l in "".join(parts).split("\n") if l.startswith("- duration")])

elif cmd=="align":
    tot=0
    for seg in segs:
        os.makedirs(R+f"work/{seg}",exist_ok=True)
        m=json.load(open(R+f"segments/{seg}/video/audio_meta.json"))
        assert not m.get("display_applied"),"already applied; re-run narrate first"
        base=0;words=[]
        for v in m["voices"]:
            for w in v["words"]: words.append({"text":w["text"],"start":round(base+w["start"],3),"end":round(base+w["end"],3)})
            base+=v["duration_s"]
        json.dump(words,open(R+f"work/{seg}/words.json","w"))
        cc=lambda *a: subprocess.run(["npx","chalk-core",*a],cwd=R,capture_output=True,text=True)
        cc("build-tokens",f"segments/{seg}/script.md","lexicon.json",f"work/{seg}/script-tokens.json")
        r=cc("align-captions","--tokens",f"work/{seg}/script-tokens.json","--words",f"work/{seg}/words.json","--out",f"work/{seg}/captions.json")
        mm=[l for l in r.stdout.splitlines() if l.startswith("MISMATCH")]; tot+=len(mm)
        print(f"== {seg}: {len(mm)} mismatch(es)"); [print("  ",l) for l in mm[:10]]
    print("total mismatches:",tot)
