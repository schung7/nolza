// The DJ booth: two turntables (deck A and deck B) and a two-channel mixer.
//
// TurntableView  one deck: platter, tonearm, controls, scratching.
// MixerView      knobs, channel faders, crossfader and level meters.
// DeckUI         the booth: which deck is live, loading records, the panel
//                and the auto-mix (cue the next record on the idle deck, hold
//                it on the spinning platter, release on the beat, crossfade).

import { Deck, Mixer, loadAudio, planMix, alignMix, RPM_BASE, RPM_45 } from './audio.js';
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
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = (p) => `${p >= 0.0005 ? '+' : p <= -0.0005 ? '−' : '±'}${Math.abs(p * 100).toFixed(1)}%`;

function turntableHTML(id) {
  const empty = id === 'A'
    ? `<span>No record on the platter</span><button class="chip" data-act="random">Drop a random one</button>`
    : `<span>The next record lands here</span>`;
  return `
  <div class="turntable" data-deck="${id}">
    <div class="tt-light" aria-hidden="true"></div>
    <div class="tt-brand mono" aria-hidden="true"><b>NOLZA</b> DD-1200 · Deck ${id}</div>
    <div class="platter">
      <div class="platter-edge"></div>
      <div class="slipmat"><span class="mono">NOLZA SOUND · LET'S PLAY · 놀자 ·</span></div>
      <div class="record" aria-hidden="true"><div class="record-grooves"></div><div class="record-label"></div></div>
      <div class="record-sheen" aria-hidden="true"></div>
      <div class="spindle" aria-hidden="true"></div>
      <div class="tt-empty mono">${empty}</div>
    </div>
    <svg class="tonearm" viewBox="0 0 1000 760" aria-hidden="true">
      <defs>
        <linearGradient id="armMetal${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f2"/><stop offset=".5" stop-color="#b9bab6"/><stop offset="1" stop-color="#7d7e7a"/></linearGradient>
        <radialGradient id="baseMetal${id}" cx=".35" cy=".35"><stop offset="0" stop-color="#f2f2ef"/><stop offset=".7" stop-color="#9c9d99"/><stop offset="1" stop-color="#5d5e5b"/></radialGradient>
        <filter id="armShadow${id}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="10" dy="16" stdDeviation="7" flood-color="#000" flood-opacity=".55"/></filter>
      </defs>
      <g transform="translate(850 694)"><rect x="-26" y="-12" width="52" height="24" rx="6" fill="#0d0d0e"/><rect x="-18" y="-6" width="36" height="12" rx="4" fill="#2a2a2c"/></g>
      <circle cx="850" cy="170" r="70" fill="#0f0f10"/><circle cx="850" cy="170" r="58" fill="url(#baseMetal${id})"/><circle cx="850" cy="170" r="40" fill="#151516"/>
      <g class="arm-group" filter="url(#armShadow${id})"><g class="arm-lift">
        <rect x="-128" y="-26" width="62" height="52" rx="8" fill="url(#armMetal${id})"/><rect x="-110" y="-26" width="4" height="52" fill="#555" opacity=".6"/>
        <rect x="-66" y="-9" width="70" height="18" rx="4" fill="#2b2b2c"/>
        <rect x="0" y="-8" width="452" height="16" rx="8" fill="url(#armMetal${id})"/>
        <g transform="translate(452 0) rotate(22)"><rect x="-8" y="-13" width="78" height="26" rx="4" fill="#1b1b1c"/><rect x="2" y="-11" width="40" height="22" rx="2" fill="#2d2d2f"/><rect x="50" y="-12" width="8" height="24" fill="#e5502f"/><path d="M 64 -13 L 92 -26 L 96 -20 L 70 -6 Z" fill="url(#armMetal${id})"/></g>
        <circle cx="0" cy="0" r="24" fill="url(#baseMetal${id})" stroke="#2a2a2a" stroke-width="3"/><circle cx="0" cy="0" r="7" fill="#1a1a1a"/>
      </g></g>
    </svg>
    <div class="tt-controls">
      <button class="tt-start" data-act="start" aria-pressed="false" aria-label="Start or stop deck ${id}"><span class="led" aria-hidden="true"></span><span class="mono">Start<span class="ss"> · Stop</span></span></button>
      <div class="tt-speed" role="group" aria-label="Deck ${id} speed">
        <button class="tt-key active" data-speed="33" aria-pressed="true">33</button><button class="tt-key" data-speed="45" aria-pressed="false">45</button>
      </div>
      <button class="tt-key tt-cue" data-act="cue" aria-label="Lift or lower the needle on deck ${id}">Cue</button>
    </div>
    <div class="pitch">
      <span class="mono pitch-l">+8</span>
      <input type="range" min="-8" max="8" step="0.1" value="0" aria-label="Deck ${id} pitch (percent)" />
      <span class="mono pitch-l">−8</span>
      <span class="mono pitch-val">0.0%</span>
    </div>
  </div>
  <div class="deck-cap">
    <span class="dk mono">${id}</span>
    <span class="dc-title">Empty</span>
    <span class="dc-meta mono"></span>
  </div>`;
}

// ============================================================ one deck
class TurntableView {
  constructor(id, slot, booth) {
    this.id = id; this.booth = booth;
    this.deck = new Deck();
    this.rec = null; this.bpm = 120;
    this.arm = REST; this.armTarget = REST; this.armMode = 'rest'; // rest | moving | down | up
    this.recAngle = 0; this.platAngle = 0;
    this.busy = false;
    this.scratch = { on: false, last: 0, acc: 0 };
    slot.innerHTML = turntableHTML(id);
    const q = (s) => slot.querySelector(s);
    this.el = {
      slot, tt: q('.turntable'), platter: q('.platter'), edge: q('.platter-edge'), record: q('.record'), label: q('.record-label'),
      armGroup: q('.arm-group'), tonearm: q('.tonearm'), start: q('[data-act="start"]'), cue: q('[data-act="cue"]'),
      pitch: q('.pitch input'), pitchVal: q('.pitch-val'), capTitle: q('.dc-title'), capMeta: q('.dc-meta'), cap: q('.deck-cap'),
    };
    this.bind();
    this.setArm(REST);
  }

  attach(mixer) { this.deck.attach(mixer.ctx, mixer.input(this.id)); }

  bind() {
    const { el, deck } = this;
    el.start.addEventListener('click', () => { this.booth.prime(); this.toggleMotor(); });
    el.cue.addEventListener('click', () => { this.booth.prime(); this.cue(); });
    el.slot.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
      el.slot.querySelectorAll('[data-speed]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
      deck.speed = b.dataset.speed === '45' ? RPM_45 : RPM_BASE;
    }));
    el.pitch.addEventListener('input', () => this.setPitch(+el.pitch.value / 100, false));
    el.pitch.addEventListener('dblclick', () => this.setPitch(0));
    el.slot.querySelector('[data-act="random"]')?.addEventListener('click', () => this.booth.loadRandom());

    // scratching
    const rec = el.record;
    const angleAt = (e) => {
      const b = el.platter.getBoundingClientRect();
      return (Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180) / Math.PI;
    };
    rec.addEventListener('pointerdown', (e) => {
      if (!this.rec) return;
      this.booth.prime();
      rec.setPointerCapture(e.pointerId);
      this.scratch = { on: true, last: angleAt(e), acc: 0 };
      deck.hand = deck.rate;
      deck.scratching = true;
      this.booth.onTouch(this.id);
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

    el.tt.tabIndex = 0;
    el.tt.setAttribute('aria-label', `Deck ${this.id} turntable. Space to start or stop.`);
    el.tt.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === el.tt) { e.preventDefault(); this.booth.prime(); this.toggleMotor(); } });
  }

  setPitch(p, moveSlider = true) {
    p = clamp(p, -0.08, 0.08);
    this.deck.pitch = p;
    if (moveSlider) this.el.pitch.value = (p * 100).toFixed(1);
    this.el.pitchVal.textContent = `${p > 0.0005 ? '+' : ''}${(p * 100).toFixed(1)}%`;
  }

  setArm(a) {
    this.arm = a;
    this.el.armGroup.setAttribute('transform', `translate(${PIVOT.x} ${PIVOT.y}) rotate(${a.toFixed(3)})`);
  }

  setMotor(on) {
    this.deck.motorOn = on;
    this.el.start.setAttribute('aria-pressed', on);
    this.el.start.classList.add('pressed'); setTimeout(() => this.el.start.classList.remove('pressed'), 140);
    this.booth.emit();
  }

  toggleMotor() {
    if (!this.rec) return;
    const on = !this.deck.motorOn;
    this.booth.onTouch(this.id);
    this.setMotor(on);
    if (on && this.armMode === 'rest') this.armToRecord();
  }

  cue() {
    if (!this.rec) return;
    this.booth.onTouch(this.id);
    if (this.armMode === 'down') { this.armMode = 'up'; this.deck.setNeedle(false); }
    else if (this.armMode === 'up') { this.armMode = 'down'; this.deck.setNeedle(true); }
    else if (this.armMode === 'rest') this.armToRecord();
    this.el.tonearm.classList.toggle('lifted', this.armMode !== 'down');
    this.el.cue.classList.toggle('up', this.armMode === 'up');
    this.booth.emit();
  }

  armToRecord() {
    this.armMode = 'moving';
    this.el.tonearm.classList.add('lifted');
    this.armTarget = this.grooveAngle();
    return new Promise((res) => {
      this.onArrive = () => {
        this.armMode = 'down';
        this.el.tonearm.classList.remove('lifted');
        setTimeout(() => { if (this.armMode === 'down') { this.deck.setNeedle(true); this.booth.emit(); } res(); }, 260);
      };
    });
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
    // a preview plays once across the side; a generated set creeps in slowly as it loops
    const d = this.deck;
    const p = d.loop ? Math.min(1, d.played / (d.length * 6)) : clamp(d.pos / d.length, 0, 1);
    return A_OUT + (A_IN - A_OUT) * p;
  }

  get playing() { return !!this.rec && this.deck.motorOn && this.deck.needle; }

  /** put a record on this platter (lifting off whatever was there) */
  async load(rec, { autoplay = false } = {}) {
    if (this.busy) { this.pending = { rec, autoplay }; return this.pendingPromise || (this.pendingPromise = new Promise((r) => (this.pendingResolve = r))); }
    this.busy = true;
    const { el, deck } = this;
    const bufferP = loadAudio(rec);
    bufferP.catch(() => {});
    if (this.rec) {
      deck.motorOn = false; el.start.setAttribute('aria-pressed', false);
      await this.armToRest();
      el.record.classList.add('lifting');
      await wait(480);
      el.record.classList.remove('loaded', 'lifting');
    }
    this.rec = rec;
    this.paintCap('Cueing up…');
    let buf;
    try { buf = await bufferP; } catch (err) {
      this.rec = null; this.busy = false; el.platter.classList.remove('has-record');
      this.paintCap('Couldn’t load that preview');
      return this.finishLoad(false);
    }
    const song = rec.kind === 'song';
    this.bpm = rec.bpm || buf.bpm || 120;
    deck.setBuffer(buf, { loop: !song });
    deck.scratching = false;
    this.setPitch(0);
    this.recAngle = Math.random() * 360;
    el.label.innerHTML = rec.art ? `<img src="${esc(rec.art)}" alt="" draggable="false">` : labelSVG(rec);
    el.record.style.setProperty('--vinyl', rec.pal.vinyl);
    el.platter.classList.add('has-record');
    await wait(30);
    el.record.classList.add('loaded');
    await wait(650);
    this.busy = false;
    this.paintCap();
    if (this.pending) { const p = this.pending; this.pending = null; const ok = await this.load(p.rec, { autoplay: p.autoplay }); return this.finishLoad(ok); }
    if (autoplay) { this.setMotor(true); this.armToRecord(); }
    return this.finishLoad(true);
  }

  finishLoad(ok) {
    const r = this.pendingResolve; this.pendingResolve = null; this.pendingPromise = null;
    r?.(ok);
    return ok;
  }

  paintCap(status) {
    const r = this.rec;
    this.el.capTitle.textContent = status || (r ? (r.kind === 'song' ? `${r.cat} ${r.title} — ${r.artist}` : `${r.cat} ${r.title}`) : 'Empty');
  }

  frame(dt) {
    const { deck, el } = this;
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

    if (this.armMode === 'moving') {
      const diff = this.armTarget - this.arm;
      const stepA = Math.sign(diff) * Math.min(Math.abs(diff), dt * 42 * (0.35 + Math.min(1, Math.abs(diff) / 12)));
      this.setArm(this.arm + stepA);
      if (Math.abs(diff) < 0.05) { this.setArm(this.armTarget); const f = this.onArrive; this.onArrive = null; f?.(); }
    } else if (this.armMode === 'down' || this.armMode === 'up') {
      this.setArm(this.arm + (this.grooveAngle() - this.arm) * Math.min(1, dt * 4));
    }

    // caption: speed and time left, like a deck display
    if (this.rec && !this.busy) {
      const meta = deck.loop
        ? `${(this.bpm * Math.abs(deck.rate)).toFixed(1)} BPM · ${fmt(deck.played)}`
        : `${pct(deck.pitch)} · −${fmt(Math.max(0, (deck.length - deck.pos) / Math.max(0.2, Math.abs(deck.rate) || 1)))}`;
      if (meta !== this.capMeta) { el.capMeta.textContent = meta; this.capMeta = meta; }
    } else if (this.capMeta) { el.capMeta.textContent = ''; this.capMeta = ''; }
    el.cap.classList.toggle('on', this.playing);
  }
}

// ============================================================ mixer
const KNOBS = [
  { p: 'trim', label: 'Trim', min: -12, max: 12, def: 0 },
  { p: 'high', label: 'Hi', min: -26, max: 6, def: 0 },
  { p: 'mid', label: 'Mid', min: -26, max: 6, def: 0 },
  { p: 'low', label: 'Low', min: -26, max: 6, def: 0 },
];

class MixerView {
  constructor(root, booth) {
    this.root = root; this.booth = booth;
    const mx = booth.mixer;
    const strip = (ch) => KNOBS.map((k) => `
      <div class="mx-knob"><div class="knob" role="slider" tabindex="0" data-ch="${ch}" data-p="${k.p}" data-min="${k.min}" data-max="${k.max}" data-def="${k.def}"
        aria-label="Channel ${ch} ${k.label}" aria-valuemin="${k.min}" aria-valuemax="${k.max}"><i></i></div><span class="mono">${k.label}</span></div>`).join('');
    const vu = (ch) => `<div class="vu" data-ch="${ch}" aria-hidden="true">${'<i></i>'.repeat(12)}</div>`;
    root.innerHTML = `
      <div class="mx-head mono"><b>NOLZA</b> MX-2</div>
      <div class="mx-body">
        <div class="mx-strip">${strip('A')}</div>
        <div class="mx-center">
          <div class="mx-knob"><div class="knob master" role="slider" tabindex="0" data-p="master" data-min="0" data-max="1" data-def="0.85" aria-label="Master volume" aria-valuemin="0" aria-valuemax="1"><i></i></div><span class="mono">Master</span></div>
          <div class="vu-pair">${vu('A')}${vu('B')}</div>
          <button class="mx-auto mono" type="button" aria-pressed="true">Auto</button>
        </div>
        <div class="mx-strip">${strip('B')}</div>
      </div>
      <div class="mx-faders">
        <div class="ch-fader"><span class="mono">A</span><input type="range" min="0" max="1" step="0.01" value="${mx.state.A.fader}" data-ch="A" aria-label="Channel A fader"></div>
        <div class="ch-fader"><span class="mono">B</span><input type="range" min="0" max="1" step="0.01" value="${mx.state.B.fader}" data-ch="B" aria-label="Channel B fader"></div>
      </div>
      <div class="mx-xf"><span class="mono">A</span><input type="range" min="0" max="1" step="0.001" value="0" aria-label="Crossfader"><span class="mono">B</span></div>
      <p class="mx-status mono" aria-live="polite"></p>`;
    this.xf = root.querySelector('.mx-xf input');
    this.status = root.querySelector('.mx-status');
    this.auto = root.querySelector('.mx-auto');
    this.vus = { A: [...root.querySelectorAll('.vu[data-ch="A"] i')], B: [...root.querySelectorAll('.vu[data-ch="B"] i')] };
    this.bind();
    root.querySelectorAll('.knob').forEach((k) => this.paintKnob(k, this.valueOf(k)));
  }

  valueOf(k) {
    const mx = this.booth.mixer.state;
    return k.dataset.p === 'master' ? mx.master : mx[k.dataset.ch][k.dataset.p];
  }

  setKnob(k, v) {
    const min = +k.dataset.min, max = +k.dataset.max;
    v = clamp(v, min, max);
    const mx = this.booth.mixer, p = k.dataset.p, ch = k.dataset.ch;
    if (p === 'master') mx.setMaster(v);
    else if (p === 'trim') mx.setTrim(ch, v);
    else mx.setEQ(ch, p, v);
    this.paintKnob(k, v);
  }

  paintKnob(k, v) {
    const min = +k.dataset.min, max = +k.dataset.max;
    const a = -135 + ((v - min) / (max - min)) * 270;
    k.style.setProperty('--a', `${a.toFixed(1)}deg`);
    k.setAttribute('aria-valuenow', v.toFixed(2));
    k.setAttribute('aria-valuetext', k.dataset.p === 'master' ? `${Math.round(v * 100)}%` : `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`);
  }

  bind() {
    const root = this.root, booth = this.booth;
    root.querySelectorAll('.knob').forEach((k) => {
      const range = +k.dataset.max - +k.dataset.min;
      let drag = null;
      k.addEventListener('pointerdown', (e) => { booth.prime(); k.setPointerCapture(e.pointerId); drag = { y: e.clientY, v: this.valueOf(k) }; e.preventDefault(); });
      k.addEventListener('pointermove', (e) => { if (drag) this.setKnob(k, drag.v + ((drag.y - e.clientY) / 140) * range); });
      k.addEventListener('pointerup', () => (drag = null));
      k.addEventListener('pointercancel', () => (drag = null));
      k.addEventListener('dblclick', () => this.setKnob(k, +k.dataset.def));
      k.addEventListener('wheel', (e) => { e.preventDefault(); this.setKnob(k, this.valueOf(k) - Math.sign(e.deltaY) * range * 0.03); }, { passive: false });
      k.addEventListener('keydown', (e) => {
        const step = range / 40;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); this.setKnob(k, this.valueOf(k) + step); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); this.setKnob(k, this.valueOf(k) - step); }
        if (e.key === 'Home' || e.key === '0') this.setKnob(k, +k.dataset.def);
      });
    });
    root.querySelectorAll('.ch-fader input').forEach((f) => f.addEventListener('input', () => { booth.prime(); booth.mixer.setFader(f.dataset.ch, +f.value); }));
    this.xf.addEventListener('input', () => { booth.prime(); booth.onUserCrossfade(+this.xf.value); });
    this.auto.addEventListener('click', () => booth.setAutoMix(!booth.autoMix));
  }

  paintXf(x) { this.xf.value = x; }

  paintMeters(dt) {
    for (const ch of ['A', 'B']) {
      const lvl = this.booth.mixer.level(ch, dt), segs = this.vus[ch];
      const lit = Math.round(lvl * segs.length);
      if (lit === this[`lit${ch}`]) continue;
      this[`lit${ch}`] = lit;
      segs.forEach((s, i) => s.classList.toggle('on', segs.length - 1 - i < lit));
    }
  }

  paintStatus(text) { if (text !== this.lastStatus) { this.status.textContent = text; this.lastStatus = text; } }
  paintAuto(on) { this.auto.setAttribute('aria-pressed', on); }
}

// ============================================================ the booth
export class DeckUI {
  constructor({ records, onState }) {
    this.records = records;
    this.onState = onState;
    this.mixer = new Mixer();
    this.views = { A: new TurntableView('A', $('deckA'), this), B: new TurntableView('B', $('deckB'), this) };
    this.live = 'A';
    this.next = null;       // { rec, deck, ready, align, cued, ratio }
    this.auto = null;       // crossfade in progress
    this.autoMix = true;
    try { this.autoMix = localStorage.getItem('nolza-automix') !== 'off'; } catch (e) {}
    this.mixerView = new MixerView($('mixer'), this);
    this.mixerView.paintAuto(this.autoMix);
    for (const id of ['A', 'B']) this.views[id].deck.onEnd = () => this.onDeckEnd(id);

    this.el = {
      sleeve: $('npSleeve'), cat: $('npCat'), title: $('npTitle'), genre: $('npGenre'), blurb: $('npBlurb'), flow: $('npFlow'),
      viz: $('viz'), dot: $('npDot'), apple: $('npApple'),
    };
    this.el.flow.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) this.load(this.records[+b.dataset.i], { autoplay: true }); });
    $('npPrev').addEventListener('click', () => this.step(-1));
    $('npNext').addEventListener('click', () => this.step(1));

    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  get other() { return this.live === 'A' ? 'B' : 'A'; }
  get liveView() { return this.views[this.live]; }
  get rec() { return this.liveView.rec; }
  get bpm() { return this.liveView.bpm; }
  get liveEl() { return this.liveView.el.tt; }

  /** Must be called from a user gesture so audio is allowed to start. */
  prime() {
    if (!this.mixer.ctx) { this.mixer.init(); this.views.A.attach(this.mixer); this.views.B.attach(this.mixer); }
    else this.mixer.init();
  }

  setAutoMix(on) {
    this.autoMix = on;
    this.mixerView.paintAuto(on);
    try { localStorage.setItem('nolza-automix', on ? 'on' : 'off'); } catch (e) {}
    if (!on) this.cancelAuto();
    else this.prepareNext();
  }

  indexOf(rec) { return rec ? this.records.findIndex((r) => r.id === rec.id) : -1; }

  step(dir) {
    const n = this.records.length;
    this.load(this.records[(this.indexOf(this.rec) + dir + n) % n], { autoplay: true });
  }

  loadRandom() { this.load(this.records[Math.floor(Math.random() * this.records.length)], { autoplay: true }); }

  /** play a record now, on the live deck */
  async load(rec, { autoplay = true } = {}) {
    this.prime();
    this.cancelAuto();
    this.next = null;
    const v = this.liveView;
    this.setCrossfader(this.live === 'A' ? 0 : 1, 0.35);
    this.fillPanel(rec, true);
    const ok = await v.load(rec, { autoplay });
    if (v !== this.liveView) return;
    if (ok) this.fillPanel(v.rec);
    else this.el.genre.textContent = 'Couldn’t load this preview — try another record.';
    this.emit();
    this.prepareNext();
  }

  // ---------------------------------------------------------- auto-mix

  /** drop the following song on the idle deck, ready to mix in */
  prepareNext() {
    if (!this.autoMix) return;
    const lv = this.liveView, ov = this.views[this.other];
    if (!lv.rec || lv.rec.kind !== 'song' || lv.busy) return;
    if (ov.playing || ov.deck.motorOn) return; // the other deck is in use
    const rec = this.records[(this.indexOf(lv.rec) + 1) % this.records.length];
    if (this.next && this.next.rec.id === rec.id && this.next.deck === this.other) return;
    const token = (this.next = { rec, deck: this.other, ready: false, align: null, cued: false });
    const cur = lv.deck.buffer;
    ov.load(rec, { autoplay: false }).then(async (ok) => {
      if (this.next !== token || !ok) return;
      token.ready = true;
      const plan = planMix(cur.beat, ov.deck.buffer.beat);
      if (!plan.beatMatched) return;
      const posA = cur.duration - 8 - 0.6;
      const al = await alignMix(cur, ov.deck.buffer, plan, posA, 8);
      if (this.next === token && lv.deck.buffer === cur) token.align = { ...al, posA, plan };
    });
  }

  maybeMix() {
    const nx = this.next, lv = this.liveView, ov = this.views[this.other];
    if (!this.autoMix || this.auto || !nx?.ready || nx.deck !== this.other) return;
    if (!lv.rec || lv.rec.kind !== 'song' || lv.deck.loop || !lv.deck.needle || !lv.deck.motorOn || lv.armMode !== 'down' || lv.deck.scratching || lv.busy || ov.busy) return;
    const speed = Math.max(0.05, Math.abs(lv.deck.rate));
    const left = (lv.deck.length - lv.deck.pos) / speed;
    const plan = planMix(lv.deck.buffer.beat, ov.deck.buffer.beat);
    const fade = plan.beatMatched ? 8 : 5;
    // 1) cue: match the pitch, start the platter while holding the record, drop the needle
    if (!nx.cued && left <= fade + 0.6 + 2.8) {
      nx.cued = true;
      nx.ratio = plan.beatMatched ? (nx.align?.ratio ?? plan.ratio) : 1;
      ov.setPitch(plan.beatMatched ? (1 + lv.deck.pitch) * nx.ratio * (lv.deck.speed / ov.deck.speed) - 1 : 0);
      ov.deck.pos = 0.3;
      ov.deck.scratching = true; ov.deck.hand = 0;   // a finger on the record, platter spinning underneath
      ov.setMotor(true);
      ov.armToRecord();
    }
    // 2) release on the beat and crossfade
    if (nx.cued && ov.armMode === 'down' && ov.deck.needle && left <= fade + 0.6 && left >= 1) {
      let offset = 0.35;
      const ratio = nx.ratio;
      if (plan.beatMatched && nx.align) offset = nx.align.offset + (lv.deck.pos - nx.align.posA) * ratio;
      else if (plan.beatMatched) {
        const ob = lv.deck.buffer.beat;
        const untilBeat = ((((ob.phase - lv.deck.pos) % ob.period) + ob.period) % ob.period) / speed;
        const rateB = Math.abs(lv.deck.motor) * ratio, P = plan.inPeriod;
        offset = ((((ov.deck.buffer.beat.phase - untilBeat * rateB) % P) + P) % P);
        while (offset < 0.3) offset += P;
      }
      ov.deck.scratching = false;
      ov.deck.rate = ov.deck.motor;
      ov.deck.played = 0;
      ov.deck.seek(offset);
      const now = this.mixer.ctx.currentTime;
      this.auto = { from: this.live, to: this.other, t0: now, dur: Math.min(fade, left - 0.3), x0: this.mixer.state.xf, x1: this.other === 'A' ? 0 : 1, plan, ratio, rec: nx.rec };
    }
  }

  /** crossfade automation, one frame at a time */
  runAuto() {
    const a = this.auto;
    if (!a) return;
    const p = clamp((this.mixer.ctx.currentTime - a.t0) / a.dur, 0, 1);
    this.setCrossfader(a.x0 + (a.x1 - a.x0) * p);
    if (p < 1) return;
    // the incoming deck is now live; let the old record spin down, then reload it
    const old = this.views[a.from];
    this.auto = null; this.next = null;
    this.live = a.to;
    old.setMotor(false);
    this.fillPanel(this.liveView.rec);
    this.emit();
    setTimeout(() => { if (!old.deck.motorOn) old.armToRest().then(() => this.prepareNext()); }, 1400);
  }

  cancelAuto() {
    const nx = this.next;
    if (nx?.cued) {
      const ov = this.views[nx.deck];
      if (!this.auto) { ov.deck.scratching = false; ov.setMotor(false); ov.armToRest(); }
      nx.cued = false;
    }
    this.auto = null;
  }

  /** any hands-on move on a deck cancels the automation for that move */
  onTouch(id) {
    if (this.next?.cued && this.next.deck === id && !this.auto) { this.next.cued = false; this.next = null; }
  }

  onUserCrossfade(x) {
    if (this.auto) { this.auto = null; this.next = null; }
    this.setCrossfader(x, 0, false);
    const side = x < 0.5 ? 'A' : 'B';
    if (side !== this.live && this.views[side].rec) {
      this.live = side;
      this.fillPanel(this.liveView.rec);
      this.emit();
      this.next = null;
      this.prepareNext();
    }
  }

  setCrossfader(x, glide = 0, paint = true) {
    const from = this.mixer.state.xf;
    if (!glide || !this.mixer.ctx) { this.mixer.setCrossfader(x); if (paint) this.mixerView.paintXf(x); return; }
    const t0 = performance.now();
    const step = () => {
      const p = clamp((performance.now() - t0) / (glide * 1000), 0, 1);
      const v = from + (x - from) * p;
      this.mixer.setCrossfader(v); this.mixerView.paintXf(v);
      if (p < 1) requestAnimationFrame(step);
    };
    step();
  }

  onDeckEnd(id) {
    // no mix happened (auto-mix off, or the next record wasn't ready): play the next song here
    if (id !== this.live || this.auto) return;
    setTimeout(() => { const v = this.views[id]; if (v.deck.ended && !v.busy && id === this.live) this.step(1); }, 700);
  }

  mixStatus() {
    if (!this.autoMix) return 'Auto-mix off';
    if (this.auto) {
      const pl = this.auto.plan;
      return pl.beatMatched ? `Mixing ${this.auto.from} → ${this.auto.to} · beat-matched ${pct(this.auto.ratio - 1)}` : `Mixing ${this.auto.from} → ${this.auto.to} · blend`;
    }
    if (this.next?.cued) return `Deck ${this.next.deck} cued · ${this.next.rec.cat}`;
    if (this.next?.ready) return `Next on ${this.next.deck} · ${this.next.rec.cat} ${this.next.rec.title}`;
    if (this.next) return `Loading deck ${this.next.deck}…`;
    return 'Auto-mix on';
  }

  // ---------------------------------------------------------- panel

  fillPanel(rec, loading = false) {
    const { el } = this;
    if (!rec) return;
    const song = rec.kind === 'song';
    el.sleeve.innerHTML = song ? `<img src="${esc(rec.art)}" alt="Cover of ${esc(rec.title)}">` : coverSVG(rec);
    el.cat.textContent = `${rec.cat} — ${rec.genre} · Deck ${this.live}`;
    el.title.textContent = rec.title;
    el.genre.textContent = loading ? 'Cueing up…' : song ? rec.artist : `${rec.genre} · ${rec.bpm} BPM`;
    el.flow.classList.toggle('upnext', song);
    if (song) {
      el.blurb.innerHTML = `${rec.album ? `From <em>${esc(rec.album)}</em>${rec.year ? ` (${esc(rec.year)})` : ''}. ` : ''}30-second preview, courtesy of Apple Music.`;
      const n = this.records.length, at = this.indexOf(rec);
      el.flow.innerHTML = [1, 2, 3].map((k) => this.records[(at + k + n) % n])
        .map((r) => `<li><button type="button" data-i="${r.index}"><span class="mono">${esc(r.cat)}</span> ${esc(r.title)} <i>${esc(r.artist)}</i></button></li>`).join('');
      el.apple.href = rec.url; el.apple.hidden = false;
    } else {
      el.blurb.textContent = rec.blurb;
      el.flow.innerHTML = rec.flow.map((f) => `<li>${esc(f)}</li>`).join('');
      el.apple.hidden = true;
    }
    document.querySelector('.decks').style.setProperty('--rec-ac', rec.pal.fg);
  }

  /** swap the list of records (e.g. a new genre); whatever is playing keeps going */
  setRecords(records) {
    this.records = records;
    if (this.rec?.kind === 'song') {
      if (!this.auto && !this.next?.cued) { this.next = null; this.prepareNext(); }
      this.fillPanel(this.rec);
    }
  }

  emit() {
    const v = this.liveView;
    this.onState?.({ rec: v.rec, playing: v.playing });
  }

  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.views.A.frame(dt);
    this.views.B.frame(dt);
    if (this.mixer.ctx) {
      this.maybeMix();
      this.runAuto();
      this.mixerView.paintMeters(dt);
    }
    this.mixerView.paintStatus(this.mixStatus());
    this.driveLights();
    this.drawViz();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  /** the page's club lighting breathes with the bass coming out of the mixer */
  driveLights() {
    const f = this.mixer.ctx ? this.mixer.spectrum() : null;
    let target = 0;
    if (f) {
      // flash on the kicks: how far the bass jumps above its recent average, plus a little overall level
      let sum = 0; for (let i = 1; i < 7; i++) sum += f[i];
      const bass = sum / 6 / 255;
      this.bassAvg = this.bassAvg === undefined ? bass : this.bassAvg + (bass - this.bassAvg) * 0.04;
      const punch = clamp((bass - this.bassAvg) / 0.1, 0, 1);
      target = clamp((bass - 0.3) / 0.6, 0, 1) * 0.3 + punch * 0.7;
    }
    const e = (this.energy || 0) + (target - (this.energy || 0)) * (target > (this.energy || 0) ? 0.6 : 0.12);
    this.energy = e;
    if (Math.abs(e - (this.lastEnergy ?? -1)) < 0.02) return;
    this.lastEnergy = e;
    // data-pulse="base gain": opacity = base + energy × gain (opacity only, so it's cheap)
    this.lightTargets = this.lightTargets || [...document.querySelectorAll('[data-pulse]')].map((el) => { const [b, g] = el.dataset.pulse.split(' ').map(Number); return { el, b, g }; });
    for (const t of this.lightTargets) t.el.style.opacity = (t.b + e * t.g).toFixed(3);
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
    const data = this.mixer.spectrum();
    const n = Math.max(24, Math.floor(w / 5));
    const accent = this.rec?.pal.fg || '#e5502f';
    for (let i = 0; i < n; i++) {
      let v = 0.04;
      if (data) { const idx = Math.floor(Math.pow(i / n, 1.6) * (data.length * 0.85)); v = Math.max(0.04, data[idx] / 255); }
      const bh = Math.max(2, v * (h - 6));
      g.fillStyle = v > 0.72 ? accent : 'rgba(241,239,233,.75)';
      g.globalAlpha = 0.35 + v * 0.65;
      g.fillRect(i * (w / n), h - bh, 1.6, bh);
    }
    g.globalAlpha = 1;
  }
}
