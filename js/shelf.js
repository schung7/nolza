// The crate: a curved shelf of record cases on a turning platter.
// Pure CSS 3D — each case is a box with a front cover, back cover and spines.

import { coverSVG, backSVG } from './covers.js';

const COPIES = 3;
const mod = (n, m) => ((n % m) + m) % m;

export class Shelf {
  constructor({ records, stage, ring, ledge, wrap, tip, onChange, onSpin }) {
    Object.assign(this, { records, stage, ring, ledge, wrap, tip, onChange, onSpin });
    this.N = records.length;
    this.M = this.N * COPIES;
    this.sel = this.N * 4 + 4; // start on NZ-005 (index 4)
    this.slots = [];
    this.lastD = [];
    this.build();
    this.measure();
    this.layout(true);
    this.bind();
    window.addEventListener('resize', () => { this.measure(); this.layout(true); });
  }

  get record() { return this.records[mod(this.sel, this.N)]; }

  build() {
    for (let j = 0; j < this.M; j++) {
      const r = this.records[j % this.N];
      const el = document.createElement('div');
      el.className = 'case';
      el.dataset.slot = j;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${r.cat} ${r.title} — ${r.genre}, ${r.bpm} BPM`);
      el.tabIndex = -1;
      el.style.setProperty('--sp', r.pal.bg);
      el.style.setProperty('--tx', r.pal.tx);
      el.style.setProperty('--lbl', r.pal.fg);
      el.style.setProperty('--vl', r.pal.vinyl);
      const spine = `<span class="spine-cat">${r.cat.replace('NZ-', '')}</span>
        <span class="spine-title">${r.title}<small>${r.genre}</small></span>
        <span class="spine-dot"></span>`;
      el.innerHTML = `<div class="case-box">
          <div class="disc"></div>
          <div class="face front">${j < this.N ? coverSVG(r) : ''}</div>
          <div class="face back">${j < this.N ? backSVG(r) : ''}</div>
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
    ring.transform = `translateZ(${R}px)`;
    this.ledgeW = R + W + 200;
    this.ledge.style.left = this.ledge.style.top = `${-this.ledgeW}px`;
    this.ledge.style.width = this.ledge.style.height = `${this.ledgeW * 2}px`;
  }

  /** compute transform for every slot from the current selection */
  layout(instant = false) {
    const { W, T, R, M } = this;
    const half = M / 2;
    const ext = (spin) => W * Math.abs(Math.cos((spin * Math.PI) / 180)) + T * Math.abs(Math.sin((spin * Math.PI) / 180));
    const spinFor = (d) => (d === 0 ? 0 : d === -1 ? 64 : d === 1 ? 116 : 90);
    // cumulative tangential positions outward from the selection
    const pos = new Map([[0, 0]]);
    for (const side of [1, -1]) {
      let x = 0, prev = 0;
      for (let k = 1; k <= half; k++) {
        const d = side * k;
        const gap = k === 1 ? W * 0.1 : 1.5;
        x += ext(spinFor(prev)) / 2 + gap + ext(spinFor(d)) / 2;
        pos.set(d, side * x);
        prev = d;
      }
    }
    this.slots.forEach((el, j) => {
      let d = mod(j - this.sel + half, M) - half; // -half .. half-1
      const x = pos.get(d) ?? 0;
      const theta = (-x / R) * (180 / Math.PI);
      const z = -R + (d === 0 ? W * 0.32 : Math.abs(d) === 1 ? W * 0.06 : 0);
      const spin = spinFor(d);
      const jumped = this.lastD[j] !== undefined && Math.abs(this.lastD[j] - d) > 2;
      if (instant || jumped) el.style.transition = 'none';
      el.style.transform = `rotateY(${theta.toFixed(3)}deg) translateZ(${z.toFixed(1)}px) rotateY(${spin}deg)`;
      const nearCam = R * (1 - Math.cos((theta * Math.PI) / 180)) + W;
      el.style.visibility = nearCam > this.persp * 0.8 ? 'hidden' : '';
      el.classList.toggle('selected', d === 0);
      el.tabIndex = d === 0 ? 0 : -1;
      if (instant || jumped) { el.offsetWidth; el.style.transition = ''; }
      this.lastD[j] = d;
    });
    this.ring.style.setProperty('--ledge-rot', `${(this.sel * this.T * 1.1 / R) * (180 / Math.PI)}deg`);
  }

  go(delta) {
    if (!delta) return;
    this.sel += delta;
    this.layout();
    this.onChange?.(this.record);
  }

  goToRecord(index) {
    // nearest slot showing that record
    const cur = mod(this.sel, this.N);
    let d = index - cur;
    if (d > this.N / 2) d -= this.N;
    if (d < -this.N / 2) d += this.N;
    this.go(d);
  }

  selectedEl() { return this.slots[mod(this.sel, this.M)]; }

  markOnDeck(rec) {
    this.slots.forEach((el, j) => el.classList.toggle('on-deck', !!rec && j % this.N === rec.index));
  }

  bind() {
    const wrap = this.wrap;
    let down = null, moved = false, acc = 0;

    wrap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, last: e.clientX, id: e.pointerId };
      moved = false; acc = 0;
    });
    wrap.addEventListener('pointermove', (e) => {
      if (down && e.pointerId === down.id) {
        const dx = e.clientX - down.last;
        if (!moved && Math.abs(e.clientX - down.x) > 6) { moved = true; wrap.classList.add('dragging'); wrap.setPointerCapture(e.pointerId); this.hideTip(); }
        if (moved) {
          acc += dx; down.last = e.clientX;
          const step = this.T * 1.6;
          while (acc <= -step) { acc += step; this.go(1); }
          while (acc >= step) { acc -= step; this.go(-1); }
        }
        return;
      }
      this.hover(e);
    });
    const end = (e) => {
      if (!down) return;
      wrap.classList.remove('dragging');
      if (!moved) this.click(e);
      down = null;
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', () => { down = null; wrap.classList.remove('dragging'); });
    wrap.addEventListener('pointerleave', () => { this.hideTip(); this.untilt(); });

    let wheelAcc = 0, wheelT = 0;
    wrap.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // let vertical scroll through
      e.preventDefault();
      wheelAcc += e.deltaX;
      const now = performance.now();
      if (Math.abs(wheelAcc) > 40 && now - wheelT > 90) { this.go(Math.sign(wheelAcc)); wheelAcc = 0; wheelT = now; }
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
    const half = this.M / 2;
    const d = mod(j - this.sel + half, this.M) - half;
    if (d === 0) this.onSpin?.(this.record);
    else this.go(d);
  }

  hover(e) {
    const c = this.caseFromEvent(e);
    if (!c) { this.hideTip(); this.untilt(); return; }
    const r = this.records[+c.dataset.slot % this.N];
    const box = this.wrap.getBoundingClientRect();
    if (c.classList.contains('selected')) {
      this.hideTip();
      const cb = c.getBoundingClientRect();
      const px = (e.clientX - cb.left) / cb.width - 0.5, py = (e.clientY - cb.top) / cb.height - 0.5;
      c.querySelector('.case-box').style.transform = `rotateY(${px * 14}deg) rotateX(${-py * 10}deg)`;
      this.tip.textContent = '';
      return;
    }
    this.untilt();
    this.tip.textContent = `${r.cat.replace('NZ-', '')} · ${r.title}`;
    this.tip.style.left = `${e.clientX - box.left}px`;
    this.tip.style.top = `${e.clientY - box.top}px`;
    this.tip.classList.add('show');
  }

  hideTip() { this.tip.classList.remove('show'); }
  untilt() { const b = this.selectedEl()?.querySelector('.case-box'); if (b) b.style.transform = ''; this.slots.forEach((s) => { if (!s.classList.contains('selected')) s.querySelector('.case-box').style.transform = ''; }); }
}
