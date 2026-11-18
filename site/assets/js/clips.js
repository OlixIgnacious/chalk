/* chalk site: five-second stick-figure clips, drawn live in SVG.
   Mount with <div class="clip" data-clip="build"></div>. Each clip loops while it is on screen.
   A figure is a rig of absolute joint angles (0 = pointing down, 90 = right, 180 = up, -90 = left),
   keyframed and eased; props are SVG updated from the same clock. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const C = { plum: '#2a1745', plum2: '#3a2360', lime: '#d4f76a', violet: '#7a52e0', paper: '#f8f5ff', lilac: '#ece7fb', onp: '#f3eeff', pink: '#ff8fb1', muted: '#6a5a86', banana: '#f6e27a' };
  const LEN = { torso: 30, neck: 3, head: 8, ua: 15, fa: 14, th: 18, sh: 18 };
  const MONO = 'JetBrains Mono, ui-monospace, monospace';
  const DISP = 'Unbounded, Manrope, sans-serif';
  const BODY = 'Manrope, system-ui, sans-serif';

  const rad = a => a * Math.PI / 180;
  const add = (p, a, l) => [p[0] + Math.sin(rad(a)) * l, p[1] + Math.cos(rad(a)) * l];
  const ease = k => .5 - .5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));
  const ramp = (t, a, b) => ease((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const pt = p => p[0].toFixed(1) + ' ' + p[1].toFixed(1);

  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const LEGS = { ll1: -7, ll2: -3, rl1: 7, rl2: 3 };
  const ARMS = { la1: -12, la2: -6, ra1: 12, ra2: 6 };
  const STAND = { x: 0, y: 114, lean: 0, ...ARMS, ...LEGS };

  function solve(p) {
    const hip = [p.x, p.y], up = 180 - p.lean;
    const sh = add(hip, up, LEN.torso), head = add(sh, up, LEN.neck + LEN.head);
    const le = add(sh, p.la1, LEN.ua), lh = add(le, p.la2, LEN.fa);
    const re = add(sh, p.ra1, LEN.ua), rh = add(re, p.ra2, LEN.fa);
    const lk = add(hip, p.ll1, LEN.th), lf = add(lk, p.ll2, LEN.sh);
    const rk = add(hip, p.rl1, LEN.th), rf = add(rk, p.rl2, LEN.sh);
    return { hip, sh, head, le, lh, re, rh, lk, lf, rk, rf };
  }
  function Fig(parent, color = C.plum, headFill) {
    const g = el('g', {}, parent);
    const path = el('path', { fill: 'none', stroke: color, 'stroke-width': 3.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    const head = el('circle', { r: LEN.head, fill: headFill || color }, g);
    return {
      g,
      draw(p) {
        const j = solve(p);
        path.setAttribute('d', `M${pt(j.hip)}L${pt(j.sh)}M${pt(j.lh)}L${pt(j.le)}L${pt(j.sh)}L${pt(j.re)}L${pt(j.rh)}M${pt(j.lf)}L${pt(j.lk)}L${pt(j.hip)}L${pt(j.rk)}L${pt(j.rf)}`);
        head.setAttribute('cx', j.head[0].toFixed(1));
        head.setAttribute('cy', j.head[1].toFixed(1));
        return j;
      }
    };
  }
  // Keyframes merge onto the previous pose, so a frame names only what changes.
  function track(frames) {
    frames.sort((a, b) => a[0] - b[0]);
    const full = []; let cur = { ...STAND };
    for (const [t, p] of frames) { cur = { ...cur, ...p }; full.push([t, cur]); }
    return t => {
      if (t <= full[0][0]) return full[0][1];
      for (let i = 1; i < full.length; i++) {
        if (t <= full[i][0]) {
          const [t0, a] = full[i - 1], [t1, b] = full[i], k = ease((t - t0) / (t1 - t0 || 1)), o = {};
          for (const key in b) o[key] = lerp(a[key], b[key], k);
          return o;
        }
      }
      return full[full.length - 1][1];
    };
  }
  function walk(t0, t1, x0, x1, extra = {}) {
    const out = [], n = Math.max(2, Math.round((t1 - t0) / .2)), s = x1 >= x0 ? 1 : -1;
    for (let i = 0; i <= n; i++) {
      const ph = i % 2 ? 1 : -1;
      out.push([t0 + (t1 - t0) * i / n, {
        x: lerp(x0, x1, i / n), y: i % 2 ? 113 : 114.5,
        ll1: 22 * ph * s, ll2: ph * s > 0 ? 12 * s : -40 * s,
        rl1: -22 * ph * s, rl2: -ph * s > 0 ? 12 * s : -40 * s,
        la1: -18 * ph * s, la2: -10 * ph * s, ra1: 18 * ph * s, ra2: 26 * ph * s,
        ...extra
      }]);
    }
    return out;
  }
  const bg = (svg, fill, w = 320, h = 180) => el('rect', { width: w, height: h, fill }, svg);
  const ground = (svg, y = 150, stroke = 'rgba(42,23,69,.18)', w = 320) => el('line', { x1: 0, x2: w, y1: y, y2: y, stroke, 'stroke-width': 2 }, svg);
  const label = (svg, x, y, text, fill = C.muted, anchor = 'start', size = 8) => el('text', { x, y, fill, 'font-size': size, 'font-family': MONO, 'letter-spacing': '.06em', 'text-anchor': anchor }, svg, text);
  const show = (e, o) => e.setAttribute('opacity', Math.max(0, Math.min(1, o)).toFixed(3));
  function bubble(svg, x, y, w, text, tail, dark) {
    const g = el('g', { opacity: 0 }, svg);
    el('rect', { x, y, width: w, height: 22, rx: 11, fill: dark ? C.plum : C.paper, stroke: C.plum, 'stroke-width': 1.5 }, g);
    el('path', { d: `M${tail[0]} ${y + 21} l6 9 l3 -9 Z`, fill: dark ? C.plum : C.paper, stroke: C.plum, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
    el('rect', { x: tail[0] - 1, y: y + 18, width: 12, height: 4, fill: dark ? C.plum : C.paper }, g);
    el('text', { x: x + w / 2, y: y + 14.5, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, 'font-family': BODY, fill: dark ? C.lime : C.plum }, g, text);
    return g;
  }

  const CLIPS = {};

  /* One source in, a video out. */
  CLIPS.build = {
    label: 'A stick figure carries a book into the chalk machine; a finished video frame slides out and the figure jumps for joy.',
    dur: 5,
    build(svg) {
      bg(svg, C.lilac); ground(svg);
      const film = el('g', {}, svg);
      el('rect', { width: 46, height: 28, rx: 4, fill: C.lime, stroke: C.plum, 'stroke-width': 2 }, film);
      el('path', { d: 'M19 8 L29 14 L19 20 Z', fill: C.plum }, film);
      const mach = el('g', {}, svg);
      el('rect', { x: 150, y: 82, width: 66, height: 68, rx: 12, fill: C.plum }, mach);
      el('rect', { x: 145, y: 104, width: 9, height: 20, rx: 2, fill: C.violet }, mach);
      const light = el('circle', { cx: 183, cy: 99, r: 5, fill: C.violet }, mach);
      el('text', { x: 183, y: 134, 'text-anchor': 'middle', fill: C.onp, 'font-size': 10, 'font-weight': 800, 'font-family': DISP }, mach, 'chalk');
      const book = el('g', {}, svg);
      el('rect', { width: 18, height: 13, rx: 2, fill: C.violet, stroke: C.plum, 'stroke-width': 1.5 }, book);
      el('line', { x1: 4, x2: 14, y1: 5, y2: 5, stroke: C.paper, 'stroke-width': 1.2 }, book);
      const f = Fig(svg);
      const hold = { la1: 62, la2: 92, ra1: 70, ra2: 96 };
      const tr = track([
        [0, { x: 28, ...hold }],
        ...walk(0, 1.6, 28, 110, hold),
        [1.65, { x: 110, y: 114, ...LEGS, ...hold }],
        [2.0, { x: 116, lean: 12, la1: 86, la2: 90, ra1: 88, ra2: 90, ll1: -14, ll2: -8, rl1: 6, rl2: 3 }],
        [2.5, { x: 112, lean: 0, ...ARMS, ...LEGS }],
        [2.85, { y: 121, la1: -40, ra1: 40, la2: -30, ra2: 30, ll1: -34, ll2: 10, rl1: 34, rl2: -10 }],
        [3.15, { y: 96, la1: -155, la2: -165, ra1: 155, ra2: 165, ll1: -12, ll2: -24, rl1: 12, rl2: 24 }],
        [3.45, { y: 116, ll1: -14, ll2: 6, rl1: 14, rl2: -6 }],
        [3.7, { y: 114, ...LEGS, la1: -12, la2: -6, ra1: 140, ra2: 172 }],
        [3.95, { ra2: 140 }], [4.2, { ra2: 172 }], [4.45, { ra2: 140 }],
        [4.9, { x: 28, ...ARMS }]
      ]);
      return t => {
        const p = tr(t), j = f.draw(p);
        if (t > 4.6) show(f.g, 1 - ramp(t, 4.6, 4.85)); else show(f.g, ramp(t, 0, .15));
        const hx = (j.lh[0] + j.rh[0]) / 2, hy = (j.lh[1] + j.rh[1]) / 2;
        const k = ramp(t, 1.9, 2.3);
        const bx = lerp(hx - 2, 140, k), by = lerp(hy - 9, 108, k);
        book.setAttribute('transform', `translate(${bx.toFixed(1)} ${by.toFixed(1)}) scale(${lerp(1, .6, k).toFixed(2)} 1)`);
        show(book, t < 2.3 ? ramp(t, 0, .2) : 0);
        const busy = t > 2.0 && t < 3.3;
        light.setAttribute('fill', busy && Math.sin(t * 22) > 0 ? C.lime : C.violet);
        mach.setAttribute('transform', busy && t < 2.7 ? `translate(${(Math.sin(t * 70) * 1.2).toFixed(2)} 0)` : '');
        const fk = ramp(t, 2.6, 3.4);
        film.setAttribute('transform', `translate(${lerp(166, 234, fk).toFixed(1)} 116)`);
        show(film, t < 4.55 ? 1 : 1 - ramp(t, 4.55, 4.9));
      };
    }
  };

  /* Every claim gets a verdict. */
  CLIPS.check = {
    label: 'A stick figure checks a source page with a magnifying glass; three claims get ticks, one fails and is fixed.',
    dur: 5.4,
    build(svg) {
      bg(svg, C.lilac); ground(svg);
      el('rect', { x: 176, y: 26, width: 124, height: 124, rx: 10, fill: C.paper, stroke: 'rgba(42,23,69,.2)', 'stroke-width': 1.5 }, svg);
      label(svg, 188, 42, 'SOURCE · v3');
      const rows = [52, 74, 96, 118], bars = [], marks = [];
      rows.forEach((y, i) => {
        bars.push(el('rect', { x: 188, y, width: [74, 64, 70, 58][i], height: 7, rx: 3, fill: C.plum, opacity: .2 }, svg));
        const m = el('g', { transform: `translate(282 ${y + 3.5})`, opacity: 0 }, svg);
        el('circle', { r: 7, fill: i === 2 ? C.pink : C.lime, stroke: C.plum, 'stroke-width': 1.5 }, m);
        el('path', { d: i === 2 ? 'M-3 -3 L3 3 M3 -3 L-3 3' : 'M-3.2 0 L-1 2.6 L3.4 -2.6', fill: 'none', stroke: C.plum, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, m);
        marks.push(m);
      });
      const fixed = el('g', { opacity: 0, transform: 'translate(282 99.5)' }, svg);
      el('circle', { r: 7, fill: C.lime, stroke: C.plum, 'stroke-width': 1.5 }, fixed);
      el('path', { d: 'M-3.2 0 L-1 2.6 L3.4 -2.6', fill: 'none', stroke: C.plum, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, fixed);
      const note = el('g', { opacity: 0 }, svg);
      el('rect', { x: 216, y: 128, width: 52, height: 14, rx: 7, fill: C.plum }, note);
      label(note, 242, 138, 'FIXED', C.lime, 'middle', 7.5);
      const glass = el('g', {}, svg);
      el('line', { x1: 0, y1: 0, x2: 8, y2: -6, stroke: C.plum, 'stroke-width': 4, 'stroke-linecap': 'round' }, glass);
      el('circle', { cx: 15, cy: -12, r: 10, fill: 'rgba(212,247,106,.35)', stroke: C.plum, 'stroke-width': 3 }, glass);
      const f = Fig(svg);
      const look = (a) => ({ ra1: a, ra2: a - 8 });
      const tr = track([
        [0, { x: 132, ...look(128) }],
        [0.9, { ...look(126) }], [1.0, look(120)], [1.8, look(118)], [1.9, look(110)],
        [2.6, { ...look(108) }],
        [2.8, { lean: -10, la1: -165, la2: 150 }],
        [3.4, { lean: -8, la1: -170, la2: 160 }],
        [3.7, { lean: 0, ...look(108), la1: -12, la2: -6 }],
        [4.2, { ...look(100) }],
        [4.6, { la1: -140, la2: -175, lean: 0 }],
        [5.1, { la1: -12, la2: -6, ...look(128) }]
      ]);
      return t => {
        const j = f.draw(tr(t));
        glass.setAttribute('transform', `translate(${j.rh[0].toFixed(1)} ${j.rh[1].toFixed(1)})`);
        [0.95, 1.85, 2.75, 4.25].forEach((at, i) => {
          const o = t < 5.05 ? ramp(t, at, at + .2) : 1 - ramp(t, 5.05, 5.35);
          show(marks[i], i === 2 ? o * (1 - ramp(t, 3.8, 4.0)) : o);
        });
        const bad = t > 2.75 && t < 3.9;
        bars[2].setAttribute('fill', bad ? C.pink : (t >= 3.9 && t < 5.2 ? C.lime : C.plum));
        bars[2].setAttribute('opacity', bad || (t >= 3.9 && t < 5.2) ? 1 : .2);
        show(fixed, t < 5.05 ? ramp(t, 3.85, 4.05) : 1 - ramp(t, 5.05, 5.35));
        show(note, t < 5.05 ? ramp(t, 3.95, 4.15) : 1 - ramp(t, 5.05, 5.35));
      };
    }
  };

  /* A skit: two voices, taking turns, one banana. */
  CLIPS.skit = {
    label: 'Two stick figures trade lines in speech bubbles; one walks forward, slips on a banana and lands on his back while the other laughs.',
    dur: 5.6,
    build(svg) {
      bg(svg, C.lilac); ground(svg);
      const banana = el('g', {}, svg);
      el('path', { d: 'M-8 0 Q0 6 8 -1 Q0 2 -8 0 Z', fill: C.banana, stroke: C.plum, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, banana);
      const b1 = bubble(svg, 34, 30, 108, 'Did you cite that?', [92]);
      const b2 = bubble(svg, 176, 30, 104, '¶ 3.2. Obviously.', [214], true);
      const b3 = bubble(svg, 196, 52, 60, 'Ha!', [214], true);
      const a = Fig(svg), b = Fig(svg, C.violet);
      const crossed = { la1: 24, la2: 100, ra1: -24, ra2: -100 };
      const ta = track([
        [0, { x: 96, ...ARMS }],
        [0.4, { ra1: 70, ra2: 120 }], [0.7, { ra1: 60, ra2: 150 }], [1.0, { ra1: 70, ra2: 120 }], [1.4, { ...ARMS }],
        [2.6, { la1: -20, ra1: 30 }],
        ...walk(2.7, 3.35, 96, 128, {}),
        [3.45, { x: 132, y: 116, lean: -30, la1: -120, la2: -150, ra1: 120, ra2: 150, ll1: 60, ll2: 40, rl1: 20, rl2: 0 }],
        [3.75, { x: 128, y: 143, lean: -88, la1: -150, la2: -170, ra1: 160, ra2: 175, ll1: 120, ll2: 140, rl1: 100, rl2: 115 }],
        [4.0, { y: 141, ll1: 110, ll2: 120, rl1: 95, rl2: 100 }],
        [4.9, { y: 143 }],
        [5.3, { x: 96, y: 114, lean: 0, ...ARMS, ...LEGS }]
      ]);
      const tb = track([
        [0, { x: 226, ...crossed }],
        [1.8, crossed], [2.0, { ra1: -120, ra2: -150, la1: 24, la2: 100 }], [2.4, { ra1: -110, ra2: -170 }], [2.8, crossed],
        [3.85, { lean: 0 }], [4.05, { lean: 14, y: 113, la1: 10, la2: -60, ra1: -10, ra2: 60 }],
        [4.25, { lean: 10, y: 115 }], [4.45, { lean: 16, y: 113 }], [4.65, { lean: 10, y: 115 }], [4.85, { lean: 14, y: 113 }],
        [5.3, { lean: 0, y: 114, ...crossed }]
      ]);
      return t => {
        a.draw(ta(t)); b.draw(tb(t));
        show(b1, ramp(t, .2, .4) - ramp(t, 1.7, 1.9));
        show(b2, ramp(t, 1.9, 2.1) - ramp(t, 3.3, 3.5));
        show(b3, ramp(t, 3.95, 4.1) - ramp(t, 5.0, 5.2));
        const k = ramp(t, 3.4, 3.9);
        const bx = lerp(140, 176, k), by = 147 - Math.sin(Math.PI * k) * 40;
        banana.setAttribute('transform', `translate(${bx.toFixed(1)} ${(t < 3.4 ? 147 : by).toFixed(1)}) rotate(${(k * 540).toFixed(0)})`);
        show(banana, t < 5.1 ? 1 : 1 - ramp(t, 5.1, 5.4));
      };
    }
  };

  /* The Short: vertical, one idea, captions burned in. */
  function danceIn(g) {
    bg(g, C.plum, 100, 178);
    const bar = el('rect', { x: 8, y: 10, width: 0, height: 3, rx: 1.5, fill: C.lime }, g);
    el('rect', { x: 8, y: 10, width: 84, height: 3, rx: 1.5, fill: 'rgba(243,238,255,.18)' }, g);
    ground(g, 140, 'rgba(243,238,255,.18)', 100);
    const f = Fig(g, C.onp, C.lime);
    const words = ['one', 'idea', 'per', 'Short'].map(w => el('text', { x: 50, y: 162, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, 'font-family': DISP, fill: C.lime, opacity: 0 }, g, w));
    const P = [
      { lean: 8, la1: -150, la2: -160, ra1: 150, ra2: 160, ll1: -16, ll2: -10, rl1: 16, rl2: 10, y: 104 },
      { lean: -8, la1: -60, la2: -90, ra1: 40, ra2: 10, ll1: -10, ll2: -4, rl1: 50, rl2: -20, y: 104 },
      { lean: 6, la1: -40, la2: -30, ra1: 140, ra2: 150, ll1: -18, ll2: -6, rl1: 18, rl2: 6, y: 104 },
      { lean: 0, la1: -90, la2: -80, ra1: 90, ra2: 80, ll1: -36, ll2: 8, rl1: 36, rl2: -8, y: 110 }
    ];
    const frames = []; for (let i = 0; i <= 16; i++) frames.push([i * .3, { x: 50, ...P[i % 4] }]);
    const tr = track(frames);
    return t => {
      f.draw(tr(t % 4.8));
      bar.setAttribute('width', (84 * (t / 4.8)).toFixed(1));
      words.forEach((w, i) => show(w, ramp(t, i * 1.2, i * 1.2 + .15) - ramp(t, i * 1.2 + 1.05, i * 1.2 + 1.2)));
    };
  }
  CLIPS.dance = { label: 'Inside a vertical frame, a stick figure dances while the caption shows one word at a time: one idea per Short.', dur: 4.8, vb: '0 0 100 178', build: danceIn };
  CLIPS.short = {
    label: 'A phone shows a dancing stick figure; notes beside it read 9:16, 15 to 60 seconds, captions burned in.',
    dur: 4.8,
    build(svg) {
      bg(svg, C.lilac);
      el('rect', { x: 112, y: 4, width: 96, height: 172, rx: 16, fill: C.plum2 }, svg);
      const g = el('g', { transform: 'translate(116 8) scale(.88 .921)' }, svg);
      const up = danceIn(g);
      [['9:16', 30], ['15–60 s', 86], ['captions burned in', 142]].forEach(([s, y], i) => {
        const x = i === 1 ? 222 : 98, anchor = i === 1 ? 'start' : 'end';
        label(svg, x, y, s.toUpperCase(), C.plum, anchor, 8);
        el('line', { x1: i === 1 ? 214 : 102, x2: i === 1 ? 220 : 108, y1: y - 3, y2: y - 3, stroke: C.violet, 'stroke-width': 1.5 }, svg);
      });
      return up;
    }
  };

  /* You approve before anything renders. */
  CLIPS.approve = {
    label: 'A stick figure raises a big stamp and slams APPROVED onto a stack of scripts, then gives a thumbs up.',
    dur: 5,
    build(svg) {
      bg(svg, C.lilac); ground(svg);
      label(svg, 16, 22, 'GATE · YOU APPROVE THE SCRIPTS', C.violet);
      el('rect', { x: 196, y: 128, width: 104, height: 6, rx: 3, fill: C.plum }, svg);
      el('rect', { x: 204, y: 134, width: 5, height: 16, fill: C.plum }, svg);
      el('rect', { x: 287, y: 134, width: 5, height: 16, fill: C.plum }, svg);
      const stack = el('g', {}, svg);
      [0, 1, 2].forEach(i => el('rect', { x: 212 - i * 2, y: 116 - i * 4, width: 64, height: 12, rx: 2, fill: C.paper, stroke: 'rgba(42,23,69,.35)', 'stroke-width': 1.2 }, stack));
      label(stack, 216, 114, 'scripts.md', C.muted, 'start', 6.5);
      const mark = el('g', { opacity: 0 }, svg);
      el('rect', { x: -26, y: -8, width: 52, height: 16, rx: 3, fill: C.lime, stroke: C.plum, 'stroke-width': 1.6 }, mark);
      el('text', { x: 0, y: 3.5, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 800, 'font-family': DISP, fill: C.plum }, mark, 'APPROVED');
      const burst = el('g', { opacity: 0, stroke: C.violet, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
      [[-34, -14, -42, -20], [0, -20, 0, -30], [34, -14, 42, -20], [-38, 2, -48, 2], [38, 2, 48, 2]].forEach(([a, b, c, d]) => el('line', { x1: a, y1: b, x2: c, y2: d }, burst));
      const stamp = el('g', {}, svg);
      el('rect', { x: -3.5, y: -2, width: 7, height: 14, rx: 3, fill: C.violet }, stamp);
      el('rect', { x: -12, y: 11, width: 24, height: 7, rx: 2, fill: C.plum }, stamp);
      const f = Fig(svg);
      const tr = track([
        [0, { x: 186, ra1: 40, ra2: 20 }],
        [0.9, { ra1: 172, ra2: 178, lean: -4 }],
        [1.2, { ra1: 176, ra2: 182, lean: -6 }],
        [1.38, { ra1: 64, ra2: 64, lean: 12 }],
        [1.7, { ra1: 64, ra2: 64, lean: 10 }],
        [2.1, { ra1: 40, ra2: 20, lean: 0 }],
        [2.8, { x: 176 }], [3.1, { lean: 6 }], [3.3, { lean: -2 }], [3.5, { lean: 4 }],
        [3.8, { la1: -130, la2: -175, lean: 0 }],
        [4.6, { la1: -12, la2: -6, x: 186 }]
      ]);
      return t => {
        const j = f.draw(tr(t));
        stamp.setAttribute('transform', `translate(${j.rh[0].toFixed(1)} ${j.rh[1].toFixed(1)})`);
        const hit = t > 1.36;
        show(mark, hit ? (t < 4.7 ? 1 : 1 - ramp(t, 4.7, 4.95)) : 0);
        const pop = hit ? 1 + .35 * (1 - ramp(t, 1.36, 1.6)) : 1;
        mark.setAttribute('transform', `translate(244 108) rotate(-8) scale(${pop.toFixed(2)})`);
        burst.setAttribute('transform', 'translate(244 106)');
        show(burst, hit ? 1 - ramp(t, 1.45, 1.9) : 0);
        stack.setAttribute('transform', t > 1.36 && t < 1.6 ? `translate(0 ${(Math.sin(t * 90) * 1.4).toFixed(2)})` : '');
      };
    }
  };

  /* News: a dated lower third, every fact with its source. */
  CLIPS.news = {
    label: 'A stick-figure reporter speaks into a microphone in front of a chart; a ticker below names the source of each fact.',
    dur: 6,
    build(svg) {
      bg(svg, C.lilac);
      const scr = el('g', {}, svg);
      el('rect', { x: 178, y: 18, width: 124, height: 78, rx: 8, fill: C.plum }, scr);
      label(scr, 188, 32, 'EVENING HOURS', C.on || C.onp, 'start', 7);
      const line = el('polyline', { points: '', fill: 'none', stroke: C.lime, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, scr);
      const ptsAll = [[188, 84], [208, 78], [228, 80], [248, 66], [268, 58], [290, 44]];
      const mic = el('g', {}, svg);
      el('line', { x1: 0, y1: 0, x2: 0, y2: -7, stroke: C.plum, 'stroke-width': 3, 'stroke-linecap': 'round' }, mic);
      el('circle', { cx: 0, cy: -10, r: 4, fill: C.violet, stroke: C.plum, 'stroke-width': 1.5 }, mic);
      const f = Fig(svg);
      const tr = track([
        [0, { x: 110, la1: 34, la2: 172, ra1: 20, ra2: 10 }],
        [0.8, { ra1: 110, ra2: 100 }], [1.4, { ra1: 118, ra2: 120 }], [2.0, { ra1: 20, ra2: 10 }],
        [3.0, { lean: 3 }], [3.4, { ra1: 70, ra2: 110 }], [3.8, { ra1: 60, ra2: 80 }], [4.2, { ra1: 70, ra2: 110, lean: 0 }],
        [5.0, { ra1: 20, ra2: 10 }], [6, {}]
      ]);
      const lt = el('g', {}, svg);
      el('rect', { x: 0, y: 128, width: 214, height: 26, fill: C.plum }, lt);
      el('rect', { x: 8, y: 134, width: 46, height: 14, rx: 7, fill: C.lime }, lt);
      label(lt, 31, 144, 'NOV 18', C.plum, 'middle', 7);
      el('text', { x: 62, y: 145, 'font-size': 9.5, 'font-weight': 700, 'font-family': BODY, fill: C.onp }, lt, 'Library adds evening hours');
      el('rect', { x: 0, y: 160, width: 320, height: 20, fill: C.lime }, svg);
      const tick = el('text', { y: 173, 'font-size': 8, 'font-family': MONO, fill: C.plum }, svg, 'SOURCE: the library’s published notice  ·  SOURCE: council minutes, item 4  ·  SOURCE: the library’s published notice  ·  SOURCE: council minutes, item 4  ·  ');
      return t => {
        const j = f.draw(tr(t));
        mic.setAttribute('transform', `translate(${j.lh[0].toFixed(1)} ${j.lh[1].toFixed(1)})`);
        const n = 1 + Math.floor(ramp(t, .2, 2.4) * (ptsAll.length - 1) + .001);
        line.setAttribute('points', ptsAll.slice(0, Math.max(2, n)).map(p => p.join(',')).join(' '));
        tick.setAttribute('x', (-(t / 6) * 330).toFixed(1));
      };
    }
  };

  /* Focus: one line at a time, at dusk. */
  CLIPS.focus = {
    label: 'At dusk a stick figure sits cross-legged on a hill and breathes slowly; the words Breathe, Read, Begin appear one at a time.',
    dur: 6,
    build(svg) {
      const defs = el('defs', {}, svg);
      const lg = el('linearGradient', { id: 'dusk-g', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: 0, 'stop-color': C.plum }, lg);
      el('stop', { offset: 1, 'stop-color': C.violet }, lg);
      el('rect', { width: 320, height: 180, fill: 'url(#dusk-g)' }, svg);
      const sun = el('circle', { cx: 230, r: 22, fill: C.lime, opacity: .9 }, svg);
      el('path', { d: 'M0 150 Q90 112 170 128 T320 132 L320 180 L0 180 Z', fill: C.plum }, svg);
      const motes = Array.from({ length: 9 }, (_, i) => el('circle', { r: 1.4 + (i % 3) * .5, fill: C.lime, opacity: .6 }, svg));
      const words = ['Breathe.', 'Read.', 'Begin.'].map(w => el('text', { x: 92, y: 62, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 500, 'font-family': DISP, fill: C.onp, opacity: 0 }, svg, w));
      const f = Fig(svg, C.onp, C.lime);
      const sit = { x: 150, y: 122, lean: 0, ll1: -78, ll2: 72, rl1: 78, rl2: -72, la1: -24, la2: -48, ra1: 24, ra2: 48 };
      return t => {
        const b = Math.sin(t / 6 * Math.PI * 2 * 2);
        f.draw({ ...sit, y: sit.y - 1.2 - b * 1.2, la1: sit.la1 - b * 3, ra1: sit.ra1 + b * 3 });
        sun.setAttribute('cy', lerp(78, 112, t / 6).toFixed(1));
        words.forEach((w, i) => show(w, ramp(t, i * 2 + .1, i * 2 + .6) - ramp(t, i * 2 + 1.5, i * 2 + 1.95)));
        motes.forEach((m, i) => {
          const ph = ((t / 6) + i / 9) % 1;
          m.setAttribute('cx', (30 + i * 33 + Math.sin(ph * 6 + i) * 6).toFixed(1));
          m.setAttribute('cy', (150 - ph * 130).toFixed(1));
          show(m, Math.sin(ph * Math.PI) * .7);
        });
      };
    }
  };

  /* Coding lesson: code built line by line, then it runs. */
  CLIPS.code = {
    label: 'A stick figure types at a desk; code appears line by line on the monitor, the tests pass and the figure cheers.',
    dur: 5.5,
    build(svg) {
      bg(svg, C.lilac); ground(svg);
      el('rect', { x: 150, y: 116, width: 150, height: 6, rx: 3, fill: C.plum }, svg);
      el('rect', { x: 286, y: 122, width: 5, height: 28, fill: C.plum }, svg);
      el('rect', { x: 84, y: 124, width: 34, height: 5, rx: 2, fill: C.violet }, svg);
      el('rect', { x: 86, y: 129, width: 4, height: 21, fill: C.violet }, svg);
      el('rect', { x: 176, y: 34, width: 112, height: 72, rx: 8, fill: C.plum }, svg);
      el('rect', { x: 226, y: 106, width: 12, height: 10, fill: C.plum }, svg);
      el('rect', { x: 160, y: 112, width: 38, height: 4, rx: 2, fill: C.muted }, svg);
      const L = [[186, 48, 52, C.lime], [194, 58, 64, 'rgba(243,238,255,.7)'], [194, 68, 44, 'rgba(243,238,255,.7)'], [202, 78, 56, '#b7a6f5'], [186, 88, 30, C.lime]];
      const lines = L.map(([x, y, w, c]) => [el('rect', { x, y, width: 0, height: 5, rx: 2.5, fill: c }, svg), w]);
      const caret = el('rect', { width: 2, height: 7, fill: C.lime }, svg);
      const pass = el('g', { opacity: 0 }, svg);
      el('rect', { x: 226, y: 84, width: 54, height: 14, rx: 7, fill: C.lime }, pass);
      label(pass, 253, 94, '✓ PASSED', C.plum, 'middle', 7);
      const f = Fig(svg);
      const typing = (i) => ({ la1: 80, la2: 100 + (i % 2 ? 8 : -4), ra1: 84, ra2: 104 + (i % 2 ? -6 : 8) });
      const frames = [[0, { x: 104, y: 122, lean: 8, ll1: 92, ll2: 2, rl1: 88, rl2: -2, ...typing(0) }]];
      for (let i = 1; i <= 16; i++) frames.push([i * .19, typing(i)]);
      frames.push([3.35, { lean: 8, ...typing(0) }], [3.6, { lean: -10, la1: -150, la2: -165, ra1: 150, ra2: 165 }], [3.85, { la2: -140, ra2: 140 }], [4.1, { la2: -165, ra2: 165 }], [4.35, { la2: -140, ra2: 140 }], [5.0, { lean: 8, ...typing(0) }]);
      const tr = track(frames);
      return t => {
        f.draw(tr(t));
        let cx = 186, cy = 48;
        lines.forEach(([r, w], i) => {
          const k = Math.min(1, Math.max(0, (t - i * .62) / .55));
          const fade = t > 5.1 ? 1 - ramp(t, 5.1, 5.45) : 1;
          r.setAttribute('width', (w * k).toFixed(1)); show(r, fade);
          if (k > 0 && k < 1) { cx = +r.getAttribute('x') + w * k + 1; cy = +r.getAttribute('y') - 1; }
        });
        caret.setAttribute('x', cx.toFixed(1)); caret.setAttribute('y', cy.toFixed(1));
        show(caret, t < 3.1 && Math.sin(t * 18) > -.3 ? 1 : 0);
        show(pass, ramp(t, 3.3, 3.5) - ramp(t, 5.0, 5.3));
      };
    }
  };

  /* ---------- runner ---------- */
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const live = [];
  function mount(host) {
    const def = CLIPS[host.dataset.clip];
    if (!def || host.firstChild) return;
    const svg = el('svg', { viewBox: def.vb || '0 0 320 180', role: 'img', 'aria-label': def.label, preserveAspectRatio: 'xMidYMid slice' });
    host.appendChild(svg);
    const c = { update: def.build(svg), dur: def.dur, start: performance.now() - Math.random() * 1000 * def.dur, vis: false };
    c.update(reduced ? def.dur * (+host.dataset.still || .55) : 0);
    if (!reduced) live.push(c);
    if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => (c.vis = e.isIntersecting)), { rootMargin: '120px' }).observe(host);
    else c.vis = true;
  }
  function frame(now) {
    for (const c of live) if (c.vis) c.update(((now - c.start) / 1000) % c.dur);
    requestAnimationFrame(frame);
  }
  function init() {
    document.querySelectorAll('[data-clip]').forEach(mount);
    if (live.length) requestAnimationFrame(frame);
  }
  window.chalkClips = { init, CLIPS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
