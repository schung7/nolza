// Turntable UI: platter, tonearm, controls, scratching and the now-playing panel.

import { Deck, renderRecord, RPM_BASE, RPM_45 } from './audio.js';
import { coverSVG, labelSVG } from './covers.js';

// geometry in the turntable's 1000 x 760 design space
const PIVOT = { x: 850, y: 170 };
const CENTER = { x: 400, y: 380 };
const NEEDLE = { x: 508, y: 22 };            // stylus point in arm-local coords
const R_OUTER = 288, R_INNER = 118;          // lead-in / run-out radii
const REST = 90;                             // arm angle on the rest

function armAngleFor(r) {
  const L = Math.hypot(NEEDLE.x, NEEDLE.y);
  const delta = Math.atan2(NEEDLE.y, NEEDLE.x);
  const dx = CENTER.x - PIVOT.x, dy = CENTER.y - PIVOT.y;
  const d = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  const a = Math.acos((L * L + d * d - r * r) / (2 * L * d));
  return ((base - a - delta) * 180) / Math.PI;
}
const A_OUT = armAngleFor(R_OUTER), A_IN = armAngleFor(R_INNER);

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class DeckUI {
  constructor({ records, onState }) {
    this.records = records;
    this.onState = onState;
    this.deck = new Deck();
    this.rec = null;
    this.arm = REST; this.armTarget = REST;
    this.armMode = 'rest'; // rest | moving | down | up
    this.recAngle = 0; this.platAngle = 0;
    this.busy = false;
    this.scratch = { on: false, last: 0, acc: 0 };

    this.el = {
      tt: $('turntable'), platter: $('platter'), edge: $('platterEdge'), record: $('record'), label: $('recordLabel'),
      armGroup: $('armGroup'), tonearm: $('tonearm'), start: $('startBtn'), cue: $('cueBtn'), pitch: $('pitch'), pitchVal: $('pitchVal'),
      sleeve: $('npSleeve'), cat: $('npCat'), title: $('npTitle'), genre: $('npGenre'), blurb: $('npBlurb'), flow: $('npFlow'),
      bpm: $('npBpm'), rpm: $('npRpm'), time: $('npTime'), viz: $('viz'), vol: $('volume'), dot: $('npDot'),
    };
    this.bind();
    this.setArm(REST);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Must be called from a user gesture so audio is allowed to start. */
  prime() { this.deck.init(); }

  bind() {
    const { el, deck } = this;
    el.start.addEventListener('click', () => { this.prime(); this.toggleMotor(); });
    el.cue.addEventListener('click', () => { this.prime(); this.cue(); });
    document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('[data-speed]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
      deck.speed = b.dataset.speed === '45' ? RPM_45 : RPM_BASE;
    }));
    const setPitch = () => { deck.pitch = +el.pitch.value / 100; el.pitchVal.textContent = `${+el.pitch.value > 0 ? '+' : ''}${(+el.pitch.value).toFixed(1)}%`; };
    el.pitch.addEventListener('input', setPitch);
    el.pitch.addEventListener('dblclick', () => { el.pitch.value = 0; setPitch(); });
    el.vol.addEventListener('input', () => deck.setVolume(+el.vol.value));
    $('npPrev').addEventListener('click', () => this.step(-1));
    $('npNext').addEventListener('click', () => this.step(1));
    $('randomRec').addEventListener('click', () => this.load(this.records[Math.floor(Math.random() * this.records.length)], { autoplay: true }));

    // scratching
    const rec = el.record;
    const angleAt = (e) => {
      const b = el.platter.getBoundingClientRect();
      return (Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180) / Math.PI;
    };
    rec.addEventListener('pointerdown', (e) => {
      if (!this.rec) return;
      this.prime();
      rec.setPointerCapture(e.pointerId);
      this.scratch = { on: true, last: angleAt(e), acc: 0 };
      deck.hand = deck.rate;
      deck.scratching = true;
      e.preventDefault();
    });
    rec.addEventListener('pointermove', (e) => {
      if (!this.scratch.on) return;
      const a = angleAt(e);
      let d = a - this.scratch.last;
      if (d > 180) d -= 360; if (d < -180) d += 360;
      this.scratch.acc += d; this.scratch.last = a;
    });
    const up = () => { if (!this.scratch.on) return; this.scratch.on = false; deck.scratching = false; };
    rec.addEventListener('pointerup', up);
    rec.addEventListener('pointercancel', up);

    // keyboard: space toggles when the turntable has focus
    el.tt.tabIndex = 0;
    el.tt.setAttribute('aria-label', 'Turntable. Space to start or stop.');
    el.tt.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === el.tt) { e.preventDefault(); this.prime(); this.toggleMotor(); } });
  }

  step(dir) {
    const i = this.rec ? this.rec.index : -1;
    const n = this.records.length;
    this.load(this.records[(i + dir + n) % n], { autoplay: true });
  }

  setArm(a) {
    this.arm = a;
    this.el.armGroup.setAttribute('transform', `translate(${PIVOT.x} ${PIVOT.y}) rotate(${a.toFixed(3)})`);
  }

  setMotor(on) {
    this.deck.motorOn = on;
    this.el.start.setAttribute('aria-pressed', on);
    this.el.start.classList.add('pressed'); setTimeout(() => this.el.start.classList.remove('pressed'), 140);
    this.emit();
  }

  toggleMotor() {
    if (!this.rec) return;
    const on = !this.deck.motorOn;
    this.setMotor(on);
    if (on && this.armMode === 'rest') this.armToRecord();
  }

  cue() {
    if (!this.rec) return;
    if (this.armMode === 'down') { this.armMode = 'up'; this.deck.setNeedle(false); }
    else if (this.armMode === 'up') { this.armMode = 'down'; this.deck.setNeedle(true); }
    else if (this.armMode === 'rest') this.armToRecord();
    this.el.tonearm.classList.toggle('lifted', this.armMode !== 'down');
    this.el.cue.classList.toggle('up', this.armMode === 'up');
    this.emit();
  }

  armToRecord() {
    this.armMode = 'moving';
    this.el.tonearm.classList.add('lifted');
    this.armTarget = this.grooveAngle();
    this.onArrive = () => {
      this.armMode = 'down';
      this.el.tonearm.classList.remove('lifted');
      setTimeout(() => { if (this.armMode === 'down') { this.deck.setNeedle(true); this.emit(); } }, 260);
    };
  }

  async armToRest() {
    if (this.armMode === 'rest') return;
    this.deck.setNeedle(false);
    this.armMode = 'moving';
    this.el.tonearm.classList.add('lifted');
    this.armTarget = REST;
    await new Promise((res) => { this.onArrive = () => { this.armMode = 'rest'; this.el.tonearm.classList.remove('lifted'); res(); }; });
  }

  grooveAngle() {
    const side = this.deck.length * 6;
    const p = Math.min(1, this.deck.played / side);
    return A_OUT + (A_IN - A_OUT) * p;
  }

  async load(rec, { autoplay = false } = {}) {
    if (this.busy) { this.pending = { rec, autoplay }; return; }
    this.busy = true;
    this.prime();
    const { el, deck } = this;
    const bufferP = renderRecord(rec);

    if (this.rec) {
      deck.motorOn = false; el.start.setAttribute('aria-pressed', false);
      await this.armToRest();
      el.record.classList.add('lifting');
      el.sleeve.classList.remove('has-disc');
      await wait(480);
      el.record.classList.remove('loaded', 'lifting');
    }

    this.rec = rec;
    this.fillPanel(rec);
    el.title.textContent = rec.title;
    el.genre.textContent = 'Cueing up…';
    const buf = await bufferP;
    el.genre.textContent = `${rec.genre} · ${rec.bpm} BPM`;
    deck.setBuffer(buf);
    this.recAngle = Math.random() * 360;

    el.label.innerHTML = labelSVG(rec);
    el.record.style.setProperty('--vinyl', rec.pal.vinyl);
    el.platter.classList.add('has-record');
    await wait(30);
    el.record.classList.add('loaded');
    el.sleeve.classList.add('has-disc');
    await wait(650);

    this.busy = false;
    this.emit();
    if (this.pending) { const p = this.pending; this.pending = null; return this.load(p.rec, { autoplay: p.autoplay }); }
    if (autoplay) { this.setMotor(true); this.armToRecord(); }
  }

  fillPanel(rec) {
    const { el } = this;
    el.sleeve.innerHTML = coverSVG(rec);
    el.cat.textContent = `${rec.cat} — ${rec.genre}`;
    el.blurb.textContent = rec.blurb;
    el.flow.innerHTML = rec.flow.map((f) => `<li>${f}</li>`).join('');
    document.querySelector('.decks').style.setProperty('--rec-ac', rec.pal.fg);
  }

  emit() {
    const playing = !!this.rec && this.deck.motorOn && this.armMode === 'down';
    this.onState?.({ rec: this.rec, playing });
  }

  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const { deck, el } = this;

    // scratching: hand speed from accumulated angle
    if (this.scratch.on) {
      const inst = dt > 0 ? (this.scratch.acc / dt) / 200 : 0;
      deck.hand += (inst - deck.hand) * Math.min(1, dt / 0.035);
    }
    const mv = deck.tick(dt);
    this.platAngle += mv.plat;
    if (this.scratch.on) { this.recAngle += this.scratch.acc; this.scratch.acc = 0; }
    else this.recAngle += mv.rec;
    el.label.style.transform = `rotate(${this.recAngle.toFixed(2)}deg)`;
    el.edge.style.transform = `rotate(${this.platAngle.toFixed(2)}deg)`;

    // tonearm
    if (this.armMode === 'moving') {
      const diff = this.armTarget - this.arm;
      const stepA = Math.sign(diff) * Math.min(Math.abs(diff), dt * 42 * (0.35 + Math.min(1, Math.abs(diff) / 12)));
      this.setArm(this.arm + stepA);
      if (Math.abs(diff) < 0.05) { this.setArm(this.armTarget); const f = this.onArrive; this.onArrive = null; f?.(); }
    } else if (this.armMode === 'down' || this.armMode === 'up') {
      const g = this.grooveAngle();
      this.setArm(this.arm + (g - this.arm) * Math.min(1, dt * 4));
    }

    // readouts
    if (this.rec) {
      el.bpm.textContent = (this.rec.bpm * Math.abs(deck.rate)).toFixed(1).padStart(5, '0');
      el.rpm.textContent = (Math.abs(deck.motor) * 33.33).toFixed(1).padStart(4, '0');
      el.time.textContent = fmt(deck.played);
    }
    this.drawViz();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  drawViz() {
    const c = this.el.viz;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const data = this.deck.needle ? this.deck.levels() : null;
    const n = Math.max(24, Math.floor(w / 5));
    const accent = this.rec?.pal.fg || '#e5502f';
    for (let i = 0; i < n; i++) {
      let v = 0.04;
      if (data) {
        const idx = Math.floor(Math.pow(i / n, 1.6) * (data.length * 0.85));
        v = Math.max(0.04, data[idx] / 255);
      }
      const bh = Math.max(2, v * (h - 6));
      g.fillStyle = v > 0.72 ? accent : 'rgba(241,239,233,.75)';
      g.globalAlpha = 0.35 + v * 0.65;
      g.fillRect(i * (w / n), h - bh, 1.6, bh);
    }
    g.globalAlpha = 1;
  }
}
