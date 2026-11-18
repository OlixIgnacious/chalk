/* chalk site: scroll is the playhead.
   GSAP + ScrollTrigger drive the scenes; a player bar maps scroll to a timecode with chapters,
   burned-in captions, letterbox for pinned scenes, and autoplay to the next page. */
(function () {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  root.classList.add('js');
  if (reduced) root.classList.add('reduced');
  if (!hasGsap) root.classList.add('no-js');
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  /* ---------- nav ---------- */
  const nav = $('.nav');
  const onScrollNav = () => nav && nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScrollNav, { passive: true }); onScrollNav();
  const toggle = $('.nav-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });

  /* ---------- copy buttons ---------- */
  $$('[data-copy]').forEach(btn => btn.addEventListener('click', () => {
    const pre = btn.closest('.term').querySelector('pre');
    const text = pre.innerText.split('\n').filter(l => !l.trim().startsWith('#')).map(l => l.replace(/^\$ /, '')).join('\n').trim();
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => selectText(pre)); else selectText(pre);
  }));
  function selectText(node) { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

  /* ---------- words for the statement scrub ---------- */
  $$('.statement').forEach(p => {
    p.innerHTML = p.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
  });

  /* ---------- title card (first visit to the home page in a session) ---------- */
  const card = $('.titlecard');
  if (card) {
    if (reduced || store.get('chalk-tc')) card.remove();
    else {
      store.set('chalk-tc', '1');
      setTimeout(() => card.classList.add('out'), 1500);
      setTimeout(() => card.remove(), 2400);
      card.addEventListener('click', () => { card.classList.add('out'); setTimeout(() => card.remove(), 700); });
    }
  }

  carousel();
  beats();
  if (hasGsap && !reduced) scenes();

  /* ---------- the four-beat line: letters ripple in as a wave, "video." keeps bobbing ---------- */
  function beats() {
    const h = $('.beats');
    if (!h || reduced) return;
    let i = 0;
    const split = node => {
      Array.from(node.childNodes).forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const word = document.createElement('span');
            word.className = 'wd';
            word.setAttribute('aria-hidden', 'true');
            [...part].forEach((c, j) => {
              const ch = document.createElement('span');
              ch.className = 'ch'; ch.textContent = c;
              ch.style.setProperty('--i', i++); ch.style.setProperty('--j', j);
              word.appendChild(ch);
            });
            frag.appendChild(word);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) split(n);
      });
    };
    split(h);
    h.classList.add('is-split');
    // .done pins the end state, so the line is readable even if an animation never finishes
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      removeEventListener('scroll', check);
      h.classList.add('in');
      setTimeout(() => h.classList.add('done'), 2500);
    };
    // two triggers: the observer, and a position check on scroll and at load
    const check = () => { const r = h.getBoundingClientRect(); if (r.top < innerHeight * .85 && r.bottom > 0) go(); };
    addEventListener('scroll', check, { passive: true });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { go(); io.disconnect(); } }, { threshold: .4 });
      io.observe(h);
    }
    check();
  }

  /* ---------- themes: a cinematic carousel driven by a 3x3 grid ---------- */
  function carousel() {
    const sec = $('.themes');
    if (!sec) return;
    const thumbs = $$('.tthumb', sec), imgs = $$('.tf-img', sec), meta = $('.tf-meta', sec), bar = $('.tf-bar', sec);
    const pager = $('.tpager', sec), count = $('.tp-count', sec), playBtn = $('.tp-play', sec);
    const PER = 9, DUR = 4500, pages = Math.ceil(thumbs.length / PER);
    let cur = 0, page = -1, front = 0, timer = null, autoplay = !reduced, inView = false, hover = false;
    pager.hidden = false;
    bar.style.setProperty('--dur', DUR + 'ms');

    function renderPage(p) {
      if (p === page) return;
      page = (p + pages) % pages;
      thumbs.forEach((t, k) => {
        const on = Math.floor(k / PER) === page;
        t.hidden = !on;
        t.classList.remove('enter');
        if (on) { t.style.setProperty('--k', k % PER); void t.offsetWidth; t.classList.add('enter'); }
      });
      const a = page * PER + 1, b = Math.min(thumbs.length, a + PER - 1);
      count.textContent = `${a}–${b} of ${thumbs.length}`;
    }
    function show(i, first) {
      cur = (i + thumbs.length) % thumbs.length;
      const t = thumbs[cur], d = t.dataset;
      thumbs.forEach(x => x.setAttribute('aria-current', x === t ? 'true' : 'false'));
      renderPage(Math.floor(cur / PER));
      if (!first) {
        const next = imgs[1 - front], prev = imgs[front];
        next.src = `assets/img/themes/${d.name}.webp`;
        next.alt = `The ${d.name} theme poster`;
        const swap = () => {
          prev.classList.remove('on'); prev.classList.add('out');
          next.classList.remove('out'); void next.offsetWidth; next.classList.add('on');
          setTimeout(() => prev.classList.remove('out'), 1000);
          front = 1 - front;
        };
        (next.decode ? next.decode() : Promise.resolve()).then(swap, swap);
        $('.tf-name', meta).textContent = d.name;
        $('.tf-for', meta).textContent = d.for;
        $('.tf-look', meta).textContent = d.look;
        $('.tf-idx', meta).firstChild.textContent = `${String(cur + 1).padStart(2, '0')} / ${thumbs.length} · `;
        meta.classList.remove('swap'); void meta.offsetWidth; meta.classList.add('swap');
      }
      schedule();
    }
    function running() { return autoplay && inView && !hover && !document.hidden; }
    function schedule() {
      clearTimeout(timer);
      bar.classList.remove('run', 'paused'); void bar.offsetWidth;
      if (!autoplay) return;
      bar.classList.add('run');
      if (!running()) { bar.classList.add('paused'); return; }
      timer = setTimeout(() => show(cur + 1), DUR);
    }
    function resume() {
      if (!running()) { clearTimeout(timer); bar.classList.add('paused'); return; }
      bar.classList.remove('paused');
      schedule();
    }
    thumbs.forEach((t, k) => t.addEventListener('click', () => show(k)));
    $('.tp-prev', sec).addEventListener('click', () => show(((page - 1 + pages) % pages) * PER));
    $('.tp-next', sec).addEventListener('click', () => show(((page + 1) % pages) * PER));
    playBtn.addEventListener('click', () => {
      autoplay = !autoplay;
      playBtn.textContent = autoplay ? 'Pause' : 'Play';
      playBtn.setAttribute('aria-label', autoplay ? 'Pause the carousel' : 'Play the carousel');
      schedule();
    });
    if (reduced) { playBtn.textContent = 'Play'; playBtn.setAttribute('aria-label', 'Play the carousel'); }
    sec.addEventListener('pointerenter', () => { hover = true; resume(); });
    sec.addEventListener('pointerleave', () => { hover = false; resume(); });
    document.addEventListener('visibilitychange', resume);
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { inView = es[0].isIntersecting; resume(); }, { threshold: .35 }).observe(sec);
    else inView = true;
    show(0, true);
  }
  if (!hasGsap || reduced) $$('[data-reveal]').forEach(e => { e.style.opacity = 1; e.style.transform = 'none'; });
  player();

  function scenes() {
    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);
    gsap.defaults({ ease: 'power2.out' });

    // Reveals
    $$('[data-reveal]').forEach(e => {
      gsap.to(e, { opacity: 1, y: 0, duration: 1, delay: +(e.dataset.reveal || 0), scrollTrigger: { trigger: e, start: 'top 88%' } });
    });

    // Statement: words light up as the playhead passes them
    $$('.statement').forEach(p => {
      const w = $$('.w', p);
      // lights up once, word by word, like a caption, and stays lit
      gsap.to(w, { opacity: 1, duration: .35, stagger: .055, ease: 'power1.out', scrollTrigger: { trigger: p, start: 'top 75%', once: true } });
    });

    // Home hero: the page flattens, citations fly into the outputs
    const hero = $('#hero');
    if (hero) {
      const stage = $('.stage', hero), cq = n => stage.clientWidth * n / 100;
      const tl = gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: '+=120%', scrub: .6, pin: '.hero-pin', anticipatePin: 1, invalidateOnRefresh: true } });
      tl.fromTo('.scene', { rotateX: 10, rotateY: -16 }, { rotateX: 0, rotateY: -4, duration: 1, ease: 'none' }, 0)
        .fromTo('.src', { rotateY: 24, z: -40 }, { rotateY: 8, z: 0, duration: 1, ease: 'none' }, 0)
        .to('.hero-copy', { y: -40, opacity: .25, duration: .8, ease: 'none' }, .2);
      $$('.strip', hero).forEach((s, i) => {
        const t = s.dataset.to.split(',').map(Number), f = s.dataset.from.split(',').map(Number);
        gsap.set(s, { left: 0, top: 0, x: () => cq(f[0]), y: () => cq(f[1]) });
        tl.fromTo(s, { opacity: 0, x: () => cq(f[0]), y: () => cq(f[1]), z: 0, scale: .9 },
          { keyframes: [
            { opacity: 1, z: 120, scale: 1, x: () => cq(f[0] + 3), y: () => cq(f[1] - 3), duration: .15 },
            { x: () => cq(t[0]), y: () => cq(t[1]), scale: .75, duration: .35, ease: 'power2.inOut' },
            { opacity: 0, scale: .4, duration: .12 }
          ] }, .08 + i * .18);
        tl.fromTo($$('.out', hero)[i], { boxShadow: '0 30px 60px -28px rgba(70,38,140,.45)' }, { boxShadow: '0 0 0 4px #d4f76a, 0 30px 60px -28px rgba(70,38,140,.45)', duration: .1, yoyo: true, repeat: 1 }, .08 + i * .18 + .48);
      });
      // ambient pointer tilt on top of the scrub
      stage.addEventListener('pointermove', e => {
        const r = stage.getBoundingClientRect();
        gsap.to('.out', { x: (e.clientX - r.left - r.width / 2) / 40, y: (e.clientY - r.top - r.height / 2) / 40, duration: .6 });
      });
    }

    // One source, three shapes: the device morphs
    const morph = $('#morph');
    if (morph) {
      const dev = $('.device', morph), wrap = $('.device-wrap', morph), steps = $$('.step', morph), faces = $$('.face', morph), dots = $$('.dots i', morph);
      const size = {
        long: () => { const w = Math.min(wrap.clientWidth, 660); return { width: w, height: w * 9 / 16 }; },
        short: () => { const h = Math.min(wrap.clientHeight * .96, 520); return { width: h * 9 / 16, height: h }; },
        lesson: () => { const w = Math.min(wrap.clientWidth, 500); return { width: w, height: w * .72 }; }
      };
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: morph, start: 'top top', end: '+=220%', scrub: .6, pin: '.morph-pin', anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: s => { const i = s.progress < .36 ? 0 : s.progress < .72 ? 1 : 2; dots.forEach((d, k) => d.classList.toggle('on', k === i)); }
        }
      });
      tl.set(dev, { width: () => size.long().width, height: () => size.long().height, aspectRatio: 'auto' }, 0)
        .to({}, { duration: .25 })
        .to(dev, { width: () => size.short().width, height: () => size.short().height, borderRadius: 30, duration: .5, ease: 'power2.inOut' })
        .to(faces[0], { opacity: 0, duration: .2 }, '<.1').to(faces[1], { opacity: 1, duration: .2 }, '<')
        .to(steps[0], { opacity: 0, y: -24, duration: .2 }, '<').fromTo(steps[1], { y: 24 }, { opacity: 1, y: 0, duration: .2 }, '<.1')
        .to({}, { duration: .3 })
        .to(dev, { width: () => size.lesson().width, height: () => size.lesson().height, borderRadius: 24, duration: .5, ease: 'power2.inOut' })
        .to(faces[1], { opacity: 0, duration: .2 }, '<.1').to(faces[2], { opacity: 1, duration: .2 }, '<')
        .to(steps[1], { opacity: 0, y: -24, duration: .2 }, '<').fromTo(steps[2], { y: 24 }, { opacity: 1, y: 0, duration: .2 }, '<.1')
        .to({}, { duration: .25 });
    }

    // Stacking cards: each one settles back as the next arrives
    const cards = $$('.card-s');
    if (matchMedia('(min-width: 861px)').matches) cards.forEach((c, i) => {
      const next = cards[i + 1]; if (!next) return;
      gsap.to(c, { scale: .93, opacity: .55, filter: 'blur(1px)', ease: 'none', scrollTrigger: { trigger: next, start: 'top 85%', end: 'top 20%', scrub: true } });
    });

    // Wipe: the clip opens to full frame
    $$('.wipe-media').forEach(m => {
      gsap.fromTo(m, { clipPath: 'inset(10% 16% 10% 16% round 34px)' }, { clipPath: 'inset(0% 0% 0% 0% round 34px)', ease: 'none', scrollTrigger: { trigger: m, start: 'top 85%', end: 'top 15%', scrub: true } });
    });

    // Horizontal scenes (pipeline, theme rail)
    $$('[data-hscroll]').forEach(sec => {
      const track = $('[data-track]', sec), pinEl = $('[data-pin]', sec);
      const bar = $('.hs-progress i', sec);
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      const tl = gsap.timeline({ scrollTrigger: {
        trigger: sec, start: 'top top', end: () => '+=' + Math.max(innerHeight * 1.2, dist() * 2.2),
        scrub: .8, pin: pinEl, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: s => bar && (bar.style.transform = `scaleX(${s.progress})`)
      } });
      // hold on the first card, travel, hold on the last
      tl.to({}, { duration: .15 }).to(track, { x: () => -dist(), ease: 'none', duration: 1 }).to({}, { duration: .15 });
    });

    // Grounding link: a line draws from the narration to its paragraph
    $$('.ground').forEach(g => {
      const path = $('svg.link path', g), a = $('.ground-line', g), b = $('.ground-src', g), svg = $('svg.link', g);
      const layout = () => {
        const R = g.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const x1 = ra.left - R.left + 40, y1 = ra.bottom - R.top, x2 = rb.right - R.left - 60, y2 = rb.top - R.top;
        svg.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
        path.setAttribute('d', `M${x1} ${y1} C ${x1} ${y1 + 60}, ${x2} ${y2 - 60}, ${x2} ${y2}`);
        const len = path.getTotalLength(); path.style.strokeDasharray = len; return len;
      };
      let len = layout();
      ScrollTrigger.addEventListener('refreshInit', () => { len = layout(); });
      gsap.fromTo(path, { strokeDashoffset: () => len }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: g, start: 'top 75%', end: 'center 45%', scrub: true, invalidateOnRefresh: true } });
      gsap.fromTo($('.verdict', g), { scale: .6, opacity: 0 }, { scale: 1, opacity: 1, duration: .5, ease: 'back.out(2)', scrollTrigger: { trigger: g, start: 'center 50%' } });
    });

    // Parallax for anything marked
    $$('[data-speed]').forEach(e => gsap.to(e, { yPercent: -10 * +e.dataset.speed, ease: 'none', scrollTrigger: { trigger: e, start: 'top bottom', end: 'bottom top', scrub: true } }));

    // Letterbox while a cinematic scene is pinned
    const cinema = $$('[data-cinema]');
    const setCinema = () => root.classList.toggle('cinema', cinema.some(sec => {
      const r = sec.getBoundingClientRect();
      return r.top <= 1 && r.bottom >= innerHeight - 1;
    }));
    addEventListener('scroll', setCinema, { passive: true });
    setCinema();

    addEventListener('load', () => ScrollTrigger.refresh());
  }

  /* ---------- the player ---------- */
  function player() {
    const chapters = $$('[data-chapter]');
    if (!chapters.length) return;
    const total = +(document.body.dataset.duration || 90);
    const next = document.body.dataset.next, nextTitle = document.body.dataset.nextTitle;
    const bar = document.createElement('div');
    bar.className = 'player';
    bar.innerHTML = `
      <p class="pcap" aria-live="polite"></p>
      <div class="pbar">
        <button class="pp" type="button" aria-label="Play the page" title="Play (K)">
          <svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>
        </button>
        <span class="tc"><b>00:00</b> / ${fmt(total)}</span>
        <div class="track" role="slider" tabindex="0" aria-label="Page position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="fill"></div><div class="head"></div></div>
        <span class="chap"></span>
      </div>`;
    document.body.appendChild(bar);
    const pp = $('.pp', bar), tcEl = $('.tc b', bar), track = $('.track', bar), fill = $('.fill', bar), head = $('.head', bar), chapEl = $('.chap', bar), cap = $('.pcap', bar);
    const lb = document.createElement('div'); lb.className = 'letterbox'; lb.innerHTML = '<i></i><i></i>'; document.body.appendChild(lb);

    let marks = [];
    function layout() {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      $$('.tick', track).forEach(t => t.remove());
      marks = chapters.map(el => {
        const top = el.getBoundingClientRect().top + scrollY;
        const p = Math.min(1, Math.max(0, top / max));
        const t = document.createElement('button');
        t.className = 'tick'; t.type = 'button'; t.style.left = (p * 100) + '%';
        t.setAttribute('aria-label', 'Jump to ' + el.dataset.chapter); t.title = el.dataset.chapter;
        t.addEventListener('click', e => { e.stopPropagation(); stop(); scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' }); });
        track.appendChild(t);
        return { el, p, top, name: el.dataset.chapter, caption: el.dataset.caption || '' };
      });
      update();
    }
    let current = -1;
    function update() {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const p = Math.min(1, Math.max(0, scrollY / max));
      fill.style.transform = `scaleX(${p})`; head.style.left = (p * 100) + '%';
      tcEl.textContent = fmt(p * total); track.setAttribute('aria-valuenow', Math.round(p * 100));
      let i = 0; marks.forEach((m, k) => { if (scrollY + innerHeight * .45 >= m.top) i = k; });
      if (i !== current && marks[i]) { current = i; chapEl.textContent = marks[i].name; caption(marks[i].caption); }
      if (p > .995 && playing) ending();
    }
    function caption(text) {
      cap.classList.remove('on'); void cap.offsetWidth;
      cap.innerHTML = text.split(/\s+/).filter(Boolean).map((w, i) => `<span style="--d:${i * .09}s">${w}</span>`).join(' ');
      if (text) cap.classList.add('on');
      clearTimeout(capTimer);
      if (!playing) capTimer = setTimeout(() => cap.classList.remove('on'), 3500);
    }
    let capTimer = null;
    function fmt(s) { s = Math.round(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

    // scrubbing the bar
    function seek(e) {
      const r = track.getBoundingClientRect(), p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      scrollTo({ top: p * (document.documentElement.scrollHeight - innerHeight) });
    }
    let dragging = false;
    track.addEventListener('pointerdown', e => { dragging = true; stop(); track.setPointerCapture(e.pointerId); seek(e); });
    track.addEventListener('pointermove', e => dragging && seek(e));
    track.addEventListener('pointerup', () => (dragging = false));
    track.addEventListener('keydown', e => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return; e.preventDefault();
      const target = marks[Math.min(marks.length - 1, Math.max(0, current + step))]; if (target) scrollTo({ top: target.top, behavior: 'smooth' });
    });

    // autoplay: scroll at video pace
    let playing = false, last = 0, y = 0;
    function loop(now) {
      if (!playing) return;
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const max = document.documentElement.scrollHeight - innerHeight;
      y = Math.min(max, y + (max / total) * dt);
      scrollTo(0, y);
      requestAnimationFrame(loop);
    }
    function play() {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (scrollY >= max - 2) scrollTo(0, 0);
      playing = true; y = scrollY; last = performance.now(); bar.classList.add('playing'); pp.setAttribute('aria-label', 'Pause');
      clearTimeout(capTimer); if (marks[current]) caption(marks[current].caption);
      requestAnimationFrame(loop);
    }
    function stop() { playing = false; bar.classList.remove('playing'); pp.setAttribute('aria-label', 'Play the page'); cancelEnd(); }
    pp.addEventListener('click', () => (playing ? stop() : play()));
    ['wheel', 'touchstart'].forEach(ev => addEventListener(ev, () => playing && stop(), { passive: true }));
    addEventListener('keydown', e => {
      if (e.target.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'k' || e.key === 'K') { e.preventDefault(); playing ? stop() : play(); }
      else if (playing && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(e.key)) stop();
    });

    // end card: up next
    const endcard = $('.upnext');
    let timer = null;
    function ending() {
      if (!endcard || !next || timer) return;
      let n = 5; const c = $('.upnext-count', endcard);
      endcard.classList.add('counting'); c.textContent = n;
      timer = setInterval(() => { n -= 1; c.textContent = n; if (n <= 0) { clearInterval(timer); location.href = next + '#play'; } }, 1000);
    }
    function cancelEnd() { if (timer) { clearInterval(timer); timer = null; } if (endcard) endcard.classList.remove('counting'); }
    if (endcard) $('.upnext-cancel', endcard)?.addEventListener('click', stop);

    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', layout);
    if (window.ScrollTrigger) window.ScrollTrigger.addEventListener('refresh', layout);
    layout();
    addEventListener('load', layout);
    if (location.hash === '#play' && !reduced) setTimeout(play, 700);
  }
})();
