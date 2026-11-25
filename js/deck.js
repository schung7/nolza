// Turntable UI: platter, tonearm, controls, scratching and the now-playing panel.

import { Deck, loadAudio, planMix, alignMix, RPM_BASE, RPM_45 } from './audio.js';
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
    this.next = null;      // the song queued for the auto-mix: { rec, buf }
    this.mixing = null;    // the mix in progress: { rec, plan }
    this.autoMix = true;
    try { this.autoMix = localStorage.getItem('nolza-automix') !== 'off'; } catch (e) {}

    this.el = {
      tt: $('turntable'), platter: $('platter'), edge: $('platterEdge'), record: $('record'), label: $('recordLabel'),
      armGroup: $('armGroup'), tonearm: $('tonearm'), start: $('startBtn'), cue: $('cueBtn'), pitch: $('pitch'), pitchVal: $('pitchVal'),
      sleeve: $('npSleeve'), cat: $('npCat'), title: $('npTitle'), genre: $('npGenre'), blurb: $('npBlurb'), flow: $('npFlow'),
      bpm: $('npBpm'), bpmLabel: $('npBpm').previousElementSibling, rpm: $('npRpm'), time: $('npTime'), viz: $('viz'), vol: $('volume'), dot: $('npDot'), apple: $('npApple'),
      mix: $('npMix'), xfKnob: $('xfKnob'), xfLabel: $('xfLabel'), autoMixBtn: $('autoMixBtn'),
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
    // "up next" list
    el.flow.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { this.prime(); this.load(this.records[+b.dataset.i], { autoplay: true }); } });
    // when a preview runs out, lift the arm and spin the next song, like an auto-DJ
    deck.onEnd = () => setTimeout(() => { if (deck.ended && !this.busy) this.step(1); }, 700);
    $('npNext').addEventListener('click', () => this.step(1));
    // auto-mix: blend into the next chart song during the last seconds
    deck.onMixDone = () => this.adoptMix();
    const paintAuto = () => { el.autoMixBtn.setAttribute('aria-pressed', this.autoMix); el.autoMixBtn.textContent = `Auto-mix ${this.autoMix ? 'on' : 'off'}`; };
    el.autoMixBtn.addEventListener('click', () => {
      this.autoMix = !this.autoMix; paintAuto();
      try { localStorage.setItem('nolza-automix', this.autoMix ? 'on' : 'off'); } catch (e) {}
      if (!this.autoMix && deck.mix) { deck.cancelMix(); this.mixing = null; }
    });
    paintAuto();
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
    if (!on) this.stopMix();
    this.setMotor(on);
    if (on && this.armMode === 'rest') this.armToRecord();
  }

  cue() {
    if (!this.rec) return;
    if (this.armMode === 'down') { this.armMode = 'up'; this.deck.setNeedle(false); this.stopMix(); }
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
    // a preview plays once across the side; a generated set creeps in slowly as it loops
    const p = this.deck.loop ? Math.min(1, this.deck.played / (this.deck.length * 6)) : Math.min(1, Math.max(0, this.deck.pos / this.deck.length));
    return A_OUT + (A_IN - A_OUT) * p;
  }

  async load(rec, { autoplay = false } = {}) {
    if (this.busy) { this.pending = { rec, autoplay }; return; }
    this.busy = true;
    this.prime();
    const { el, deck } = this;
    this.stopMix();
    this.next = null;
    const bufferP = loadAudio(rec);
    bufferP.catch(() => {});

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
    let buf;
    try { buf = await bufferP; } catch (err) {
      el.genre.textContent = 'Couldn’t load this preview — try another record.';
      this.rec = null; this.busy = false; el.platter.classList.remove('has-record'); this.emit();
      return;
    }
    const song = rec.kind === 'song';
    this.bpm = rec.bpm || buf.bpm || 120;
    el.bpmLabel.textContent = song ? 'Pitch' : 'BPM';
    el.genre.textContent = song ? rec.artist : `${rec.genre} · ${rec.bpm} BPM`;
    deck.setBuffer(buf, { loop: !song });
    this.recAngle = Math.random() * 360;

    el.label.innerHTML = rec.art ? `<img src="${esc(rec.art)}" alt="" draggable="false">` : labelSVG(rec);
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
    this.prepareNext();
  }

  // ------------------------------------------------------------ auto-mix

  /** fetch the following chart song so it's ready to mix in */
  prepareNext() {
    this.next = null;
    if (!this.rec || this.rec.kind !== 'song') return;
    const rec = this.records[(this.rec.index + 1) % this.records.length];
    const token = (this.next = { rec, buf: null, align: null });
    const cur = this.deck.buffer;
    loadAudio(rec).then(async (buf) => {
      if (this.next !== token) return;
      token.buf = buf;
      // work out the beat alignment ahead of time, for a mix starting at the planned point
      const plan = planMix(cur.beat, buf.beat);
      if (!plan.beatMatched) return;
      const posA = cur.duration - 8 - 0.6;
      const al = await alignMix(cur, buf, plan, posA, 8);
      if (this.next === token && this.deck.buffer === cur) token.align = { ...al, posA, plan };
    }).catch(() => {});
  }

  stopMix() {
    if (this.deck.mix) this.deck.cancelMix();
    this.mixing = null;
  }

  /** start the mix once the current preview is close enough to its end */
  maybeMix() {
    const { deck } = this, nx = this.next;
    if (!this.autoMix || this.busy || !this.rec || this.rec.kind !== 'song' || deck.mix || deck.loop) return;
    if (!deck.needle || !deck.motorOn || this.armMode !== 'down' || deck.scratching || !nx?.buf) return;
    const speed = Math.max(0.05, Math.abs(deck.rate));
    const left = (deck.length - deck.pos) / speed;            // real seconds left on this record
    const plan = planMix(deck.buffer.beat, nx.buf.beat);
    const fade = plan.beatMatched ? 8 : 5;
    if (left > fade + 0.6 || left < 1) return;                // previews fade out at the very end
    let offset = 0.35, ratio = plan.ratio;
    if (plan.beatMatched && nx.align) {
      // the pre-computed alignment, shifted by however far A is from the planned start
      ratio = nx.align.ratio;
      offset = nx.align.offset + (deck.pos - nx.align.posA) * ratio;
      plan.ratio = ratio;
    } else if (plan.beatMatched) {
      // start the incoming record so its beats land on this record's beats
      const ob = deck.buffer.beat;
      const untilBeat = ((((ob.phase - deck.pos) % ob.period) + ob.period) % ob.period) / speed;
      const rateB = Math.abs(deck.motor) * plan.ratio, P = plan.inPeriod;
      offset = ((((nx.buf.beat.phase - untilBeat * rateB) % P) + P) % P);
      while (offset < 0.3) offset += P;
    }
    if (deck.startMix(nx.buf, { ratio, offset, fade: Math.min(fade, left - 0.3) })) this.mixing = { rec: nx.rec, plan };
  }

  /** the incoming song takes over the platter mid-flow */
  adoptMix() {
    const m = this.mixing, { el, deck } = this;
    this.mixing = null;
    if (!m) return;
    const res = deck.adoptMix();
    if (!res) return;
    this.rec = m.rec;
    this.bpm = deck.buffer.bpm || 120;
    el.pitch.value = (res.pitch * 100).toFixed(1);
    el.pitchVal.textContent = `${res.pitch > 0 ? '+' : ''}${(res.pitch * 100).toFixed(1)}%`;
    this.fillPanel(m.rec);
    el.title.textContent = m.rec.title;
    el.genre.textContent = m.rec.artist;
    el.record.classList.add('swap');
    setTimeout(() => { el.label.innerHTML = `<img src="${esc(m.rec.art)}" alt="" draggable="false">`; }, 160);
    setTimeout(() => el.record.classList.remove('swap'), 420);
    this.emit();
    this.prepareNext();
  }

  paintMix() {
    const { el, deck } = this;
    const song = this.rec?.kind === 'song';
    if (el.mix.hidden === song) el.mix.hidden = !song;
    if (!song) return;
    const p = deck.mix ? deck.mix.progress : 0;
    el.xfKnob.style.left = `${(p * 100).toFixed(1)}%`;
    let label;
    if (this.mixing) {
      const pl = this.mixing.plan, pc = (pl.ratio - 1) * 100;
      label = `Mixing into ${this.mixing.rec.cat} ${this.mixing.rec.title}${pl.beatMatched ? ` · beat-matched ${pc >= 0 ? '+' : '−'}${Math.abs(pc).toFixed(1)}%` : ' · blend'}`;
    } else if (this.autoMix && this.next) label = `Next in the mix · ${this.next.rec.cat} ${this.next.rec.title}`;
    else label = 'Auto-mix off';
    if (label !== this.mixLabel) { el.xfLabel.textContent = label; this.mixLabel = label; }
  }

  fillPanel(rec) {
    const { el } = this;
    const song = rec.kind === 'song';
    el.sleeve.innerHTML = song ? `<img src="${esc(rec.art)}" alt="Cover of ${esc(rec.title)}">` : coverSVG(rec);
    el.cat.textContent = `${rec.cat} — ${rec.genre}`;
    el.flow.classList.toggle('upnext', song);
    if (song) {
      el.blurb.innerHTML = `${rec.album ? `From <em>${esc(rec.album)}</em>${rec.year ? ` (${esc(rec.year)})` : ''}. ` : ''}30-second preview, courtesy of Apple Music.`;
      const n = this.records.length;
      el.flow.innerHTML = [1, 2, 3].map((k) => this.records[(rec.index + k) % n])
        .map((r) => `<li><button type="button" data-i="${r.index}"><span class="mono">${esc(r.cat)}</span> ${esc(r.title)} <i>${esc(r.artist)}</i></button></li>`).join('');
      el.apple.href = rec.url; el.apple.hidden = false;
    } else {
      el.blurb.textContent = rec.blurb;
      el.flow.innerHTML = rec.flow.map((f) => `<li>${esc(f)}</li>`).join('');
      el.apple.hidden = true;
    }
    document.querySelector('.decks').style.setProperty('--rec-ac', rec.pal.fg);
  }

  /** swap the list of records the deck steps through (e.g. when the chart loads) */
  setRecords(records) { this.records = records; }

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
      if (this.rec.kind === 'song') {
        // no reliable tempo for chart previews, so show speed like a real deck
        let pc = (Math.abs(deck.rate) - 1) * 100;
        if (Math.abs(pc) < 0.05) pc = 0;
        el.bpm.textContent = `${pc >= 0 ? '+' : '−'}${Math.abs(pc).toFixed(1)}%`;
      } else el.bpm.textContent = (this.bpm * Math.abs(deck.rate)).toFixed(1).padStart(5, '0');
      el.rpm.textContent = (Math.abs(deck.motor) * 33.33).toFixed(1).padStart(4, '0');
      el.time.textContent = deck.loop ? fmt(deck.played) : fmt(Math.max(0, deck.pos));
    }
    this.maybeMix();
    this.paintMix();
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
