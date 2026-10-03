# Frame generator: spec + word timings (audio_meta.json display words) -> compositions/frames/*.html
# usage: CCARP_DIR=<output dir>/ python3 frames.py [segment ...]
import json,os,re,html,sys
import importlib
_m=importlib.import_module(os.environ.get("CCARP_SPEC","spec_ch2"))
SPEC,TRACK=_m.SPEC,_m.TRACK
TRACKMAP=getattr(_m,"TRACKMAP",None)
R=os.environ["CCARP_DIR"]
INK,CREAM,MUTED,HINT,BORDER,ORANGE="#111111","#F0ECE5","#888880","#505048","#282826","#E85D26"
esc=lambda s: html.escape(s,quote=False)
FONT="""
@font-face{font-family:'Barlow';src:url('assets/fonts/Barlow_400.woff2') format('woff2');font-weight:400;font-display:block}
@font-face{font-family:'Barlow';src:url('assets/fonts/Barlow_600.woff2') format('woff2');font-weight:600;font-display:block}
@font-face{font-family:'Barlow';src:url('assets/fonts/Barlow_900.woff2') format('woff2');font-weight:900;font-display:block}
@font-face{font-family:'IBM Plex Mono';src:url('assets/fonts/IBMPlexMono_500.woff2') format('woff2');font-weight:500;font-display:block}
"""
CSS="""
#root{position:absolute;inset:0;overflow:hidden;font-family:'Barlow',system-ui,sans-serif;color:#F0ECE5}
.a{position:absolute}
.chrome{font-weight:600;font-size:21px;line-height:1;letter-spacing:.14em;text-transform:uppercase;color:#888880;white-space:nowrap}
.lab{color:#E85D26}
.hero{font-weight:900;text-transform:lowercase;letter-spacing:-.03em;line-height:1.0;color:#F0ECE5;white-space:nowrap}
.hair{background:#282826}
.mono{font-family:'IBM Plex Mono',monospace;font-weight:500}
"""
def norm(s): return re.sub(r"[.,:;?!\"'()“”]","",s.lower()).strip()
class Cues:
    def __init__(s,words): s.w=words
    def at(s,kw):
        nth=0
        if isinstance(kw,list): kw,nth=kw
        k=norm(kw); hits=[i for i,w in enumerate(s.w) if norm(w["text"])==k or norm(w["text"]).startswith(k)]
        if len(hits)<=nth: raise SystemExit(f"cue {kw!r} (#{nth}) not found in: "+" ".join(w['text'] for w in s.w))
        return max(0.05,round(s.w[hits[nth]]["start"]-0.1,3))

def comp(c,fid,i,cues):
    k=c["k"]; y=c.get("y",340); hot=set(c["hot"]) if isinstance(c.get("hot"),(list,tuple)) else set(); h=[];j=[]
    cs=[cues.at(x) for x in c.get("cues",[])] if "cues" in c else []
    P=f"{fid}-c{i}"
    up=lambda sel,t,d=.5,yy=14: j.append(f'tl.fromTo("{sel}",{{opacity:0,y:{yy}}},{{opacity:1,y:0,duration:{d},ease:"power3.out"}},{t});')
    if k=="rows":
        n=len(c["items"]); cols=c.get("cols",1); sub=any("s" in it for it in c["items"])
        per=-(-n//cols); pitch=min(168 if sub else 132,(890-y)/per); width=1708 if cols==1 else 840
        fs=(60 if cols==1 else 46) if pitch>=100 else (44 if cols==1 else 36)
        for q,it in enumerate(c["items"]):
            col=q//per if cols>1 else 0; r=q%per if cols>1 else q
            x=106+col*(840+28); top=y+r*pitch; color=ORANGE if q in hot else CREAM
            h.append(f'<div id="{P}-r{q}" class="a" style="left:{x}px;top:{top:.0f}px;width:{width}px;height:{pitch-8:.0f}px;border-top:1px solid {BORDER}">'
                     f'<div class="chrome lab a" style="left:0;top:{int(fs*0.42)}px">{esc(it["n"])}</div>'
                     f'<div class="a" style="left:96px;top:{int(fs*0.22)}px;width:{width-104}px;font-weight:600;font-size:{fs}px;line-height:1.12;color:{color};letter-spacing:-.01em">{esc(it["t"])}</div>'
                     +(f'<div class="a" style="left:96px;top:{int(fs*0.22)+fs+10}px;width:{width-104}px;font-weight:400;font-size:{max(28,int(fs*0.58))}px;line-height:1.2;color:{MUTED}">{esc(it["s"])}</div>' if "s" in it else "")+'</div>')
            up(f"#{P}-r{q}",cs[q])
    elif k=="chips":
        if c.get("label"): h.append(f'<div id="{P}-lab" class="a chrome" style="left:106px;top:{y-42}px">{esc(c["label"])}</div>'); up(f"#{P}-lab",cs[0],.4,8)
        h.append(f'<div class="a" style="left:106px;top:{y}px;width:1708px;display:flex;flex-wrap:wrap;gap:22px">')
        for q,t in enumerate(c["items"]):
            bc=ORANGE if q in hot else MUTED
            h.append(f'<div id="{P}-ch{q}" class="{"mono" if c.get("mono") else ""}" style="border:1px solid {bc};padding:14px 32px;font-weight:600;font-size:{c.get("fs") or (38 if c.get("mono") else 48)}px;color:{ORANGE if q in hot else CREAM};white-space:nowrap">{esc(t)}</div>')
            up(f"#{P}-ch{q}",cs[q],.45,10)
        h.append('</div>')
    elif k=="table":
        w=c["w"]; n=len(c["rows"]); pitch=min(124,(890-(y+56))/n); xs=[106]
        for ww in w[:-1]: xs.append(xs[-1]+ww)
        h.append(f'<div id="{P}-th" class="a" style="left:106px;top:{y}px;width:1708px;height:46px;border-bottom:1px solid {MUTED}">'+"".join(f'<div class="chrome a" style="left:{xs[q]-106}px;top:6px">{esc(t)}</div>' for q,t in enumerate(c["head"]))+'</div>')
        j.append(f'tl.fromTo("#{P}-th",{{opacity:0}},{{opacity:1,duration:.4}},0.15);')
        for q,row in enumerate(c["rows"]):
            top=y+56+q*pitch
            h.append(f'<div id="{P}-tr{q}" class="a" style="left:106px;top:{top:.0f}px;width:1708px;height:{pitch-4:.0f}px;border-top:1px solid {BORDER}">'+"".join(
                f'<div class="a" style="left:{xs[m]-106}px;top:{(pitch-4)/2-(30 if pitch>=100 else 22):.0f}px;width:{w[m]-24}px;font-weight:{"900" if m==0 else "600"};font-size:{(48 if len(row[m])<30 else 40) if pitch>=100 else (38 if len(row[m])<34 else 32)}px;line-height:1.1;color:{ORANGE if (q in hot and m==0) else CREAM}">{esc(t)}</div>' for m,t in enumerate(row))+'</div>')
            up(f"#{P}-tr{q}",cs[q],.5,12)
    elif k=="flow":
        n=len(c["items"]); gap=70; wd=(1708-gap*(n-1))/n
        for q,it in enumerate(c["items"]):
            x=106+q*(wd+gap); col=ORANGE if q in hot else CREAM
            h.append(f'<div id="{P}-n{q}" class="a" style="left:{x:.0f}px;top:{y}px;width:{wd:.0f}px;border-top:2px solid {col};padding-top:26px"><div class="chrome lab" style="margin-bottom:22px">{q+1:02d}</div><div style="font-weight:600;font-size:{60 if n<4 else 46}px;line-height:1.12;color:{col};letter-spacing:-.01em">{esc(it["t"])}</div></div>')
            up(f"#{P}-n{q}",cs[q],.55,14)
            if q<n-1:
                h.append(f'<div id="{P}-a{q}" class="a" style="left:{x+wd+10:.0f}px;top:{y-1}px;width:{gap-20}px;height:2px;background:{MUTED}"></div>')
                j.append(f'tl.fromTo("#{P}-a{q}",{{scaleX:0,transformOrigin:"left center"}},{{scaleX:1,duration:.4,ease:"power2.out"}},{cs[q+1]-0.2:.3f});')
    elif k=="cols":
        n=len(c["items"]); wd=(1708-60*(n-1))/n
        for q,it in enumerate(c["items"]):
            x=106+q*(wd+60); col=ORANGE if q in hot else CREAM
            h.append(f'<div id="{P}-k{q}" class="a" style="left:{x:.0f}px;top:{y}px;width:{wd:.0f}px;border-top:2px solid {col};padding-top:22px"><div class="chrome {"lab" if q in hot else ""}" style="margin-bottom:18px">{esc(it["l"])}</div><div style="font-weight:600;font-size:72px;line-height:1.06;color:{col};letter-spacing:-.015em">{esc(it["t"])}</div><div style="font-weight:400;font-size:40px;line-height:1.3;color:{MUTED};margin-top:22px">{esc(it["s"])}</div></div>')
            up(f"#{P}-k{q}",cs[q],.6,16)
    elif k=="bars":
        for q,it in enumerate(c["items"]):
            top=y+q*136; col=ORANGE if it.get("hot") else CREAM
            h.append(f'<div id="{P}-b{q}" class="a" style="left:106px;top:{top}px;width:1708px;height:120px"><div style="font-weight:600;font-size:44px;color:{col};margin-bottom:14px">{esc(it["l"])}</div>'
                     f'<div class="a" style="left:0;top:78px;width:1300px;height:32px;background:{BORDER}"></div><div id="{P}-f{q}" class="a" style="left:0;top:78px;width:{13*it["v"]}px;height:32px;background:{col}"></div>'
                     f'<div class="a hero" style="left:1340px;top:36px;font-size:96px;color:{col}">{it["v"]}%</div></div>')
            up(f"#{P}-b{q}",cs[q],.4,12)
            j.append(f'tl.fromTo("#{P}-f{q}",{{scaleX:0,transformOrigin:"left center"}},{{scaleX:1,duration:.8,ease:"power2.out"}},{cs[q]+.1:.3f});')
    elif k=="scale":
        n=len(c["ticks"]); x0,x1=306,1614; ay=y+110
        h.append(f'<div id="{P}-ax" class="a" style="left:{x0}px;top:{ay}px;width:{x1-x0}px;height:2px;background:{MUTED}"></div>')
        j.append(f'tl.fromTo("#{P}-ax",{{scaleX:0,transformOrigin:"left center"}},{{scaleX:1,duration:.6,ease:"power2.out"}},0.4);')
        for q,t in enumerate(c["ticks"]):
            x=x0+(x1-x0)*q/(n-1)
            h.append(f'<div class="a" style="left:{x-1:.0f}px;top:{ay-10}px;width:2px;height:22px;background:{MUTED}"></div><div class="a chrome" style="left:{x-60:.0f}px;width:120px;text-align:center;top:{ay+30}px">{esc(t)}</div>')
        for q,m in enumerate(c["marks"]):
            x=x0+(x1-x0)*m["at"]/(n-1)
            h.append(f'<div id="{P}-m{q}" class="a" style="left:{x-280:.0f}px;top:{ay-110}px;width:560px;text-align:center"><div style="font-weight:600;font-size:46px;color:{ORANGE if q==0 else CREAM}">{esc(m["l"])}</div><div style="width:2px;height:40px;background:{ORANGE if q==0 else CREAM};margin:10px auto 0"></div></div>')
            up(f"#{P}-m{q}",cs[q],.5,10)
    elif k=="quote":
        h.append(f'<div id="{P}-q" class="a" style="left:106px;top:{y}px;width:1560px;padding-left:48px;border-left:6px solid {ORANGE};font-weight:600;font-size:88px;line-height:1.1;letter-spacing:-.015em;color:{CREAM}">“{esc(c["t"])}”</div>')
        up(f"#{P}-q",cues.at(c["cue"]),.8,20)
    elif k=="stat":
        col=ORANGE if c.get("hot") else CREAM
        h.append(f'<div id="{P}-s" class="a" style="left:106px;top:{y}px;width:1708px;height:170px"><div class="a hero" style="left:0;top:0;font-size:190px;text-transform:none;color:{col}">{esc(c["t"])}</div><div class="a" style="left:640px;top:56px;width:1170px;font-weight:600;font-size:44px;line-height:1.2;color:{MUTED}">{esc(c["s"])}</div></div>')
        up(f"#{P}-s",cues.at(c["cue"]),.6,14)
    return "".join(h),"\n  ".join(j)

def build(seg,idx,f,dur,words,tracker_i):
    fid=f"f{idx:02d}-{f['slug']}"; cues=Cues(words); h=[];j=[]
    big=f.get("big")
    if tracker_i is not None:
        h.append(f'<div id="{fid}-trk" class="a chrome" style="left:106px;top:84px;display:flex;gap:34px">'+"".join(
            f'<span style="{f"color:{CREAM};border-bottom:3px solid {ORANGE};padding-bottom:9px" if q==tracker_i else ""}">{esc(t)}</span>' for q,t in enumerate(TRACK))+'</div>')
        j.append(f'tl.fromTo("#{fid}-trk",{{opacity:0,y:8}},{{opacity:1,y:0,duration:.5,ease:"power3.out"}},0.08);')
    h.append(f'<div id="{fid}-lab" class="a chrome lab" style="left:106px;top:{150 if not big else 250}px">{esc(f["label"])}</div>')
    j.append(f'tl.fromTo("#{fid}-lab",{{opacity:0,y:8}},{{opacity:1,y:0,duration:.5,ease:"power3.out"}},0.12);')
    size=190 if big else (116 if len(f["head"])==1 else 96); top=330 if big else 190
    for q,line in enumerate(f["head"]):
        h.append(f'<div id="{fid}-h{q}" class="a hero" style="left:106px;top:{top+q*(size+6)}px;font-size:{size}px">{esc(line)}</div>')
        tc=f.get("titlecues",["Claude","prompting"])
        t=cues.at(tc[0]) if big and q==0 else (cues.at(tc[1]) if big else 0.2+q*0.15)
        j.append(f'tl.fromTo("#{fid}-h{q}",{{opacity:0,y:24}},{{opacity:1,y:0,duration:.7,ease:"power3.out"}},{t});')
    for i,c in enumerate(f["body"]):
        a,b=comp(c,fid,i,cues); h.append(a); j.append(b)
    page=f"""<template>
<style>{FONT}{CSS}</style>
<div id="root" data-composition-id="{fid}" data-width="1920" data-height="1080">
  <div id="{fid}-bg" class="clip a" data-start="0" data-duration="{dur}" data-track-index="0" style="inset:0;background:{INK}"></div>
{chr(10).join(h)}
</div>
<script>
  const tl=gsap.timeline({{paused:true}});
  {chr(10).join(j)}
  window.__timelines["{fid}"]=tl;
</script>
</template>
"""
    os.makedirs(R+f"segments/{seg}/video/compositions/frames",exist_ok=True)
    open(R+f"segments/{seg}/video/compositions/frames/{fid}.html","w").write(page)
    return fid

if __name__=="__main__":
    only=sys.argv[1:] or list(SPEC)
    for seg in only:
        m=json.load(open(R+f"segments/{seg}/video/audio_meta.json")); n=len(SPEC[seg])
        for i,f in enumerate(SPEC[seg],1):
            v=m["voices"][i-1]; dur=round(v["duration_s"]+(1.8 if i==n else 0),3)
            tr=None if seg=="01" else (TRACKMAP[seg] if TRACKMAP else int(seg)-2)
            print(seg,build(seg,i,f,dur,v["words"],tr),dur)
