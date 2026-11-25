// The crate: a curved shelf of record cases on a turning platter.
// Pure CSS 3D — each case is a box with a front cover, back cover and spines.

import { coverSVG, backSVG, songBackSVG } from './covers.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mod = (n, m) => ((n % m) + m) % m;
// per-slot pose at integer offsets from the selection
const spinFor = (d) => (d === 0 ? 0 : d === -1 ? 64 : d === 1 ? 116 : 90);
const popFor = (d, W) => (d === 0 ? W * 0.32 : Math.abs(d) === 1 ? W * 0.06 : 0);

export class Shelf {
  constructor({ records, stage, ring, ledge, wrap, tip, onChange, onSpin, start = 0 }) {
    Object.assign(this, { records, stage, ring, ledge, wrap, tip, onChange, onSpin });
    this.N = records.length;
    // small crates are repeated so the shelf always looks full
    this.M = this.N * Math.max(1, Math.ceil(30 / this.N));
    // pos: where the shelf is drawn (float, in slots); target: where it's heading.
    this.pos = this.target = start;
    this.vel = 0;
    this.open = this.openTarget = this.openVel = 0;
    this.lastSel = this.sel;
    this.dragging = false;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.slots = [];
    this.dots = document.createElement('div');
    this.dots.className = 'ledge-dots';
    this.ledge.appendChild(this.dots);
    this.build();
    this.measure();
    this.render();
    this.bind();
    window.addEventListener('resize', () => { this.measure(); this.render(); });
  }

  /** the record the shelf is on (or heading to) */
  get sel() { return Math.round(this.target); }
  get record() { return this.records[mod(this.sel, this.N)]; }

  build() {
    for (let j = 0; j < this.M; j++) {
      const r = this.records[j % this.N];
      const el = document.createElement('div');
      el.className = 'case';
      el.dataset.slot = j;
      el.setAttribute('role', 'button');
      const song = r.kind === 'song';
      el.setAttribute('aria-label', song ? `${r.cat} ${r.title} by ${r.artist}` : `${r.cat} ${r.title} — ${r.genre}, ${r.bpm} BPM`);
      el.tabIndex = -1;
      el.style.setProperty('--sp', r.pal.bg);
      el.style.setProperty('--tx', r.pal.tx);
      el.style.setProperty('--lbl', r.pal.fg);
      el.style.setProperty('--vl', r.pal.vinyl);
      const spine = `<span class="spine-cat">${esc(r.cat.replace(/^NZ-|^#/, ''))}</span>
        <span class="spine-title">${esc(r.title)}<small>${esc(song ? r.artist : r.genre)}</small></span>
        <span class="spine-dot"></span>`;
      const front = song ? `<img src="${esc(r.art)}" data-hi="${esc(r.art.replace('/300x300bb', '/600x600bb'))}" alt="" decoding="async" draggable="false">` : j < this.N ? coverSVG(r) : '';
      const back = song ? songBackSVG(r) : j < this.N ? backSVG(r) : '';
      el.innerHTML = `<div class="case-box">
          <div class="disc"></div>
          <div class="face front">${front}</div>
          <div class="face back">${back}</div>
          <div class="face spine l">${spine}</div>
          <div class="face spine r">${spine}</div>
          <div class="face top"></div>
          <div class="face bottom"></div>
        </div>`;
      this.ring.appendChild(el);
      this.slots.push(el);
    }
    // later copies reuse the first copy's artwork (keeps the DOM lighter)
    for (let j = this.N; j < this.M; j++) {
      if (this.records[j % this.N].kind === 'song') break;
      const src = this.slots[j % this.N];
      this.slots[j].querySelector('.front').innerHTML = src.querySelector('.front').innerHTML;
      this.slots[j].querySelector('.back').innerHTML = src.querySelector('.back').innerHTML;
    }
  }

  measure() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const wrapH = this.wrap.clientHeight || vh * 0.45;
    const k = vw < 640 ? 0.44 : vw < 1100 ? 0.32 : 0.25;
    const W = Math.round(Math.max(150, Math.min(vw * k, wrapH * 0.82, 340)));
    const T = Math.round(W * 0.15);
    const R = W * 5.2;
    this.W = W; this.T = T; this.R = R;
    const s = this.stage.style;
    this.persp = W * 4.2;
    s.setProperty('--persp', `${this.persp}px`);
    const ring = this.ring.style;
    ring.setProperty('--W', `${W}px`); ring.setProperty('--H', `${W}px`); ring.setProperty('--T', `${T}px`); ring.setProperty('--R', `${R}px`);
    ring.setProperty('--band-out', `${W * 0.5 + 190}px`);
    ring.setProperty('--band-in', `${W * 1.5 + 230 + 26}px`);
    this.ledgeW = R + W + 200;
    this.ledge.style.left = this.ledge.style.top = `${-this.ledgeW}px`;
    this.ledge.style.width = this.ledge.style.height = `${this.ledgeW * 2}px`;

    // tangential position of the slot at each integer offset from the selection
    const ext = (spin) => W * Math.abs(Math.cos((spin * Math.PI) / 180)) + T * Math.abs(Math.sin((spin * Math.PI) / 180));
    const half = Math.floor(this.M / 2) + 1;
    this.X = new Map([[0, 0]]);
    for (const side of [1, -1]) {
      let x = 0, prev = 0;
      for (let k = 1; k <= half; k++) {
        const d = side * k;
        x += ext(spinFor(prev)) / 2 + (k === 1 ? W * 0.1 : 1.5) + ext(spinFor(d)) / 2;
        this.X.set(d, side * x);
        prev = d;
      }
    }
    this.dragStep = T * 1.45;
  }

  /** draw every case for the current (fractional) shelf position */
  render() {
    const { W, R, M, X } = this;
    // centre the sleeve + disc pair while the record is out
    this.ring.style.transform = `translateX(${(-this.open * W * 0.3).toFixed(1)}px) translateZ(${R}px)`;
    const half = Math.floor(M / 2);
    const lerp = (a, b, f) => a + (b - a) * f;
    const near = Math.round(this.pos);
    for (let j = 0; j < M; j++) {
      const el = this.slots[j];
      const d = mod(j - this.pos + half, M) - half;      // fractional offset, -half .. half
      const i0 = Math.floor(d), f = d - i0;
      // when the disc slides out of the selected sleeve, the cases to its right make room
      const x = lerp(X.get(i0) ?? 0, X.get(i0 + 1) ?? 0, f) + this.open * W * 0.66 * Math.min(1, Math.max(0, d));
      const theta = (-x / R) * (180 / Math.PI);
      const z = -R + lerp(popFor(i0, W), popFor(i0 + 1, W), f);
      const spin = lerp(spinFor(i0), spinFor(i0 + 1), f);
      const hide = R * (1 - Math.cos((theta * Math.PI) / 180)) + W > this.persp * 0.8 || Math.abs(d) > half - 1;
      if (hide) { if (!el.hidden3d) { el.style.visibility = 'hidden'; el.hidden3d = true; } continue; }
      if (el.hidden3d) { el.style.visibility = ''; el.hidden3d = false; }
      const tf = `rotateY(${theta.toFixed(3)}deg) translateZ(${z.toFixed(1)}px) rotateY(${spin.toFixed(2)}deg)`;
      if (tf !== el.tf) { el.style.transform = tf; el.tf = tf; }
      const isSel = mod(j, M) === mod(near, M);
      if (isSel !== el.isSel) {
        el.classList.toggle('selected', isSel); el.tabIndex = isSel ? 0 : -1; el.isSel = isSel;
        // the cover facing you gets the sharp artwork
        const img = isSel && el.querySelector('.front img[data-hi]');
        if (img) { const hi = img.dataset.hi; img.removeAttribute('data-hi'); const pre = new Image(); pre.onload = () => { img.src = hi; }; pre.src = hi; }
      }
    }
  }

  /** spring the shelf toward its target, one frame at a time */
  animate() {
    if (this.raf) return;
    let last = performance.now();
    const step = (t) => {
      const dt = Math.min(0.034, (t - last) / 1000); last = t;
      if (!this.dragging) {
        const k = this.reduced ? 900 : 110, c = 2 * Math.sqrt(k);   // critically damped
        this.vel += (k * (this.target - this.pos) - c * this.vel) * dt;
        this.vel = Math.max(-40, Math.min(40, this.vel));
        this.pos += this.vel * dt;
      }
      {
        const k = this.reduced ? 900 : 150, c = 2 * Math.sqrt(k);
        this.openVel += (k * (this.openTarget - this.open) - c * this.openVel) * dt;
        this.open += this.openVel * dt;
      }
      this.render();
      const settled = !this.dragging && Math.abs(this.target - this.pos) < 0.0006 && Math.abs(this.vel) < 0.002
        && Math.abs(this.openTarget - this.open) < 0.001 && Math.abs(this.openVel) < 0.002;
      if (settled) { this.pos = this.target; this.vel = 0; this.open = this.openTarget; this.openVel = 0; this.render(); this.raf = 0; return; }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** 0 = shelf closed, 1 = room for the disc to slide fully out */
  setOpen(v) {
    if (v === this.openTarget) return;
    this.openTarget = v;
    this.animate();
  }

  emit() {
    if (this.sel === this.lastSel) return;
    this.lastSel = this.sel;
    this.onChange?.(this.record);
  }

  go(delta) {
    if (!delta) return;
    this.target = Math.round(this.target) + delta;
    this.emit();
    this.animate();
  }

  goToRecord(index) {
    // nearest slot showing that record
    const cur = mod(this.sel, this.N);
    let d = index - cur;
    if (d > this.N / 2) d -= this.N;
    if (d < -this.N / 2) d += this.N;
    this.go(d);
  }

  /** slide the selected record out of its sleeve (or back in) */
  pull(on) {
    this.pulling = on;
    this.selectedEl().classList.toggle('pulling', on);
    this.setOpen(on ? 1 : 0);
  }

  /** update a record's spine colours (e.g. once its artwork colour is known) */
  recolor(r) {
    for (let j = r.index; j < this.M; j += this.N) {
      const el = this.slots[j];
      el.style.setProperty('--sp', r.pal.bg); el.style.setProperty('--tx', r.pal.tx); el.style.setProperty('--lbl', r.pal.fg);
    }
  }

  selectedEl() { return this.slots[mod(this.sel, this.M)]; }

  markOnDeck(rec) {
    this.slots.forEach((el, j) => el.classList.toggle('on-deck', !!rec && j % this.N === rec.index));
  }

  bind() {
    const wrap = this.wrap;
    let down = null, moved = false;

    wrap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, id: e.pointerId, startPos: this.pos, samples: [{ t: performance.now(), p: this.pos }] };
      moved = false;
    });
    wrap.addEventListener('pointermove', (e) => {
      if (down && e.pointerId === down.id) {
        const dx = e.clientX - down.x;
        if (!moved && Math.abs(dx) > 6) {
          moved = true; this.dragging = true; this.vel = 0;
          wrap.classList.add('dragging'); wrap.setPointerCapture(e.pointerId); this.hideTip(); this.untilt();
          down.x = e.clientX; down.startPos = this.pos;
        }
        if (moved) {
          this.pos = down.startPos - (e.clientX - down.x) / this.dragStep;
          this.target = this.pos;
          const now = performance.now();
          down.samples.push({ t: now, p: this.pos });
          while (down.samples.length > 2 && now - down.samples[0].t > 100) down.samples.shift();
          this.emit();
          this.animate();
        }
        return;
      }
      this.hover(e);
    });
    const end = (e) => {
      if (!down) return;
      wrap.classList.remove('dragging');
      if (moved) {
        // fling: carry the finger's speed, then settle on the nearest record
        const s0 = down.samples[0], s1 = down.samples[down.samples.length - 1];
        const v = s1.t > s0.t ? ((s1.p - s0.p) / (s1.t - s0.t)) * 1000 : 0;
        this.dragging = false;
        this.vel = v;
        this.target = Math.round(this.pos + v * 0.16);
        this.emit();
        this.animate();
      } else this.click(e);
      down = null;
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', () => {
      if (down && moved) { this.dragging = false; this.target = Math.round(this.pos); this.emit(); this.animate(); }
      down = null; wrap.classList.remove('dragging');
    });
    wrap.addEventListener('pointerleave', () => { this.hideTip(); this.untilt(); if (!this.pulling) this.setOpen(0); });

    // trackpad / horizontal wheel: glide continuously, then snap
    let snapT, dir = 0;
    wrap.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // let vertical scroll through
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      this.target += (e.deltaX * unit) / (this.dragStep * 1.6);
      dir = Math.sign(e.deltaX);
      this.emit();
      this.animate();
      clearTimeout(snapT);
      // settle on a record, leaning the way the gesture was going
      snapT = setTimeout(() => { this.target = Math.round(this.target + dir * 0.3); this.emit(); this.animate(); }, 160);
    }, { passive: false });
  }

  caseFromEvent(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el?.closest?.('.case');
  }

  click(e) {
    const c = this.caseFromEvent(e);
    if (!c) return;
    const j = +c.dataset.slot;
    const half = Math.floor(this.M / 2);
    const d = mod(j - this.sel + half, this.M) - half;
    if (d === 0) this.onSpin?.(this.record);
    else this.go(d);
  }

  hover(e) {
    const c = this.caseFromEvent(e);
    if (!c) { this.hideTip(); this.untilt(); if (!this.pulling) this.setOpen(0); return; }
    const r = this.records[+c.dataset.slot % this.N];
    const box = this.wrap.getBoundingClientRect();
    if (c.classList.contains('selected')) {
      this.hideTip();
      if (!this.pulling && e.pointerType === 'mouse') this.setOpen(0.18);
      const cb = c.getBoundingClientRect();
      const px = (e.clientX - cb.left) / cb.width - 0.5, py = (e.clientY - cb.top) / cb.height - 0.5;
      c.querySelector('.case-box').style.transform = `rotateY(${px * 14}deg) rotateX(${-py * 10}deg)`;
      this.tip.textContent = '';
      return;
    }
    this.untilt();
    if (!this.pulling) this.setOpen(0);
    this.tip.textContent = r.kind === 'song' ? `${r.cat} · ${r.title} — ${r.artist}` : `${r.cat.replace('NZ-', '')} · ${r.title}`;
    this.tip.style.left = `${e.clientX - box.left}px`;
    this.tip.style.top = `${e.clientY - box.top}px`;
    this.tip.classList.add('show');
  }

  hideTip() { this.tip.classList.remove('show'); }
  untilt() { const b = this.selectedEl()?.querySelector('.case-box'); if (b) b.style.transform = ''; this.slots.forEach((s) => { if (!s.classList.contains('selected')) s.querySelector('.case-box').style.transform = ''; }); }
}
