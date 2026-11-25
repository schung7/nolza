// Live audio: every record is synthesised in the browser (no audio files).
// A record is rendered once into a seamless loop in a background worker,
// then played by a Deck that behaves like a turntable — motor inertia,
// spin-up / spin-down, pitch fader, 33/45 and scratching (incl. backwards).

import { addCrackle } from './synth.js';

// --------------------------------------------------------------- render
// Records are synthesised in a Web Worker (js/render-worker.js → synth.js),
// so rendering never blocks scrolling, the crate or the turntable.
const cache = new Map();
let worker = null, seq = 0;
const pending = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      data.error ? p.reject(new Error(data.error)) : p.resolve(data);
    };
    worker.onerror = () => { // e.g. module workers unsupported: fall back for everything still queued
      const waiting = [...pending.values()];
      pending.clear(); worker = false;
      waiting.forEach((p) => renderInline(p.rec).then(p.resolve, p.reject));
    };
  } catch (e) { worker = false; }
  return worker;
}

async function renderInline(rec) {
  const { renderAll } = await import('./synth.js');
  await new Promise((r) => setTimeout(r, 0));
  return renderAll(rec);
}

function toBuffer({ sr, channels }) {
  const buf = new AudioBuffer({ length: channels[0].length, numberOfChannels: 2, sampleRate: sr });
  channels.forEach((c, i) => buf.copyToChannel(c, i));
  return buf;
}

export function renderRecord(rec) {
  if (!cache.has(rec.id)) {
    const w = getWorker();
    const job = w
      ? new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject, rec }); w.postMessage({ id, rec: JSON.parse(JSON.stringify(rec)) }); })
      : renderInline(rec);
    const p = job.then(toBuffer);
    p.catch(() => cache.delete(rec.id));
    cache.set(rec.id, p);
  }
  return cache.get(rec.id);
}

// ----------------------------------------------------------- chart previews
// 30-second Apple previews: fetched when needed, decoded, and held in memory
// only (a few at a time). Nothing is written to disk or browser storage.
const previews = new Map();
const KEEP = 4;
let decoder = null;

function loadPreview(rec) {
  if (previews.has(rec.id)) {
    const p = previews.get(rec.id);
    previews.delete(rec.id); previews.set(rec.id, p); // most recently used
    return p;
  }
  const p = (async () => {
    const res = await fetch(rec.previewUrl);
    if (!res.ok) throw new Error(`preview ${res.status}`);
    const bytes = await res.arrayBuffer();
    decoder = decoder || new OfflineAudioContext(2, 1, 44100);
    const buf = await new Promise((ok, fail) => decoder.decodeAudioData(bytes, ok, fail));
    buf.bpm = estimateBPM(buf);
    return buf;
  })();
  p.catch(() => previews.delete(rec.id));
  previews.set(rec.id, p);
  while (previews.size > KEEP) previews.delete(previews.keys().next().value);
  return p;
}

/** a song preview from the chart, or a generated set */
export function loadAudio(rec) {
  return rec.previewUrl ? loadPreview(rec) : renderRecord(rec);
}

/** rough tempo from an onset envelope + autocorrelation (for the BPM readout) */
export function estimateBPM(buf) {
  const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const fps = 200, hop = Math.round(buf.sampleRate / fps), n = Math.floor(a.length / hop);
  const env = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let k = i * hop, end = k + hop; k < end; k += 4) { const v = a[k] + b[k]; e += v * v; }
    e = Math.log(1 + e);
    env[i] = Math.max(0, e - prev); prev = e;
  }
  // autocorrelation at each whole lag once, then refine around the peak
  const lo = Math.floor((60 * fps) / 180), hi = Math.ceil((60 * fps) / 70);
  const sc = new Float32Array(2 * hi + 3);
  for (let lag = lo; lag <= 2 * hi + 2 && lag < n - 1; lag++) { let s = 0; for (let i = lag; i < n; i++) s += env[i] * env[i - lag]; sc[lag] = s / (n - lag); }
  // a beat period should also line up at twice its length (the bar's half-notes),
  // and tempos near 120 are a priori likelier for chart music
  const fit = (lag) => (sc[lag] + 0.5 * sc[2 * lag]) * Math.exp(-0.5 * Math.pow(Math.log2((60 * fps) / lag / 120) / 0.7, 2));
  let bestLag = lo;
  for (let lag = lo; lag <= hi; lag++) if (fit(lag) > fit(bestLag)) bestLag = lag;
  const y0 = fit(bestLag - 1) || 0, y1 = fit(bestLag), y2 = fit(bestLag + 1) || 0, den = y0 - 2 * y1 + y2;
  if (den) bestLag += Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)); // parabolic peak
  let bpm = bestLag ? (60 * fps) / bestLag : 120;
  while (bpm < 80) bpm *= 2;
  while (bpm > 165) bpm /= 2;
  return Math.round(bpm * 2) / 2;
}

function crackleBuffer(ctx, secs, amt) {
  const len = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) addCrackle(b.getChannelData(ch), amt);
  return b;
}

// --------------------------------------------------------------- deck
const RPM_BASE = 1;          // 33⅓ = rate 1
const RPM_45 = 45 / 33.333;

export class Deck {
  constructor() {
    this.ctx = null;
    this.buffer = null; this.rev = null;
    this.pos = 0;                 // seconds into the buffer (forward)
    this.rate = 0;                // record surface speed (1 = nominal)
    this.motor = 0;               // platter speed
    this.motorOn = false;
    this.speed = RPM_BASE; this.pitch = 0;
    this.needle = false;
    this.scratching = false; this.hand = 0;
    this.dir = 1; this.src = null;
    this.volume = 0.85;
    this.played = 0;
    this.loop = true;             // generated sets loop; chart previews play once
    this.onEnd = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.out = ctx.createGain(); this.out.gain.value = this.volume;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 256; this.analyser.smoothingTimeConstant = 0.78;
    this.out.connect(this.analyser).connect(ctx.destination);
    this.needleGain = ctx.createGain(); this.needleGain.gain.value = 0;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 20000;
    this.needleGain.connect(this.tone).connect(this.out);
    // live surface noise
    const cb = crackleBuffer(ctx, 4, 0.16);
    const cs = ctx.createBufferSource(); cs.buffer = cb; cs.loop = true;
    this.crackle = ctx.createGain(); this.crackle.gain.value = 0;
    cs.connect(this.crackle).connect(this.out); cs.start();
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    return ctx;
  }

  get target() { return this.motorOn ? this.speed * (1 + this.pitch) : 0; }
  get length() { return this.buffer ? this.buffer.duration : 1; }

  setBuffer(buf, { loop = true } = {}) {
    this.killSource();
    this.buffer = buf; this.rev = null; this.pos = 0; this.played = 0;
    this.loop = loop; this.ended = false;
  }

  reverseBuffer() {
    if (this.rev) return this.rev;
    const b = this.buffer, r = new AudioBuffer({ length: b.length, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
    for (let ch = 0; ch < b.numberOfChannels; ch++) { const s = b.getChannelData(ch), d = r.getChannelData(ch); for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i]; }
    return (this.rev = r);
  }

  killSource() {
    if (this.src) { try { this.src.stop(); } catch (e) {} this.src.disconnect(); this.src = null; }
  }

  startSource(dir) {
    this.killSource();
    if (!this.buffer || !this.ctx) return;
    const L = this.length;
    const p = this.loop ? ((this.pos % L) + L) % L : Math.min(L - 0.001, Math.max(0, this.pos));
    const s = this.ctx.createBufferSource();
    s.buffer = dir > 0 ? this.buffer : this.reverseBuffer();
    s.loop = this.loop;
    s.onended = () => { if (this.src === s) this.src = null; };
    s.playbackRate.value = Math.max(0.0001, Math.abs(this.rate));
    s.connect(this.needleGain);
    s.start(0, dir > 0 ? p : L - p);
    this.src = s; this.dir = dir;
  }

  setNeedle(down) {
    if (!this.ctx) return;
    this.needle = down;
    const t = this.ctx.currentTime;
    if (down) {
      if (!this.src) this.startSource(this.rate < 0 ? -1 : 1);
      this.thump();
    }
    this.needleGain.gain.setTargetAtTime(down ? 1 : 0, t, 0.02);
  }

  thump() {
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.12);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.2);
  }

  setVolume(v) { this.volume = v; if (this.out) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03); }

  /** advance physics; returns degrees the record and platter moved */
  tick(dt) {
    const tgt = this.target;
    // motor: quick start, slower electronic brake
    const k = tgt > this.motor ? 3.2 : 2.2;
    this.motor += (tgt - this.motor) * Math.min(1, dt * k);
    if (Math.abs(tgt - this.motor) < 0.0005) this.motor = tgt;

    if (this.scratching) {
      this.rate += (this.hand - this.rate) * Math.min(1, dt * 30);
    } else {
      this.rate += (this.motor - this.rate) * Math.min(1, dt * 14);
    }
    this.pos += this.rate * dt;
    if (this.rate > 0 && this.needle) this.played += this.rate * dt;
    if (!this.loop) {
      // a one-shot record: hold at the start, and finish at the run-out
      if (this.pos < 0) this.pos = 0;
      if (this.pos >= this.length) {
        this.pos = this.length;
        if (this.needle && !this.ended && !this.scratching) { this.ended = true; this.onEnd?.(); }
      } else this.ended = false;
    }

    const atEdge = !this.loop && (this.pos >= this.length || (this.pos <= 0 && this.rate < 0));
    if (this.ctx && this.buffer && this.needle && !atEdge) {
      const dir = this.rate < -0.001 ? -1 : 1;
      if (!this.src || dir !== this.dir) this.startSource(dir);
      const now = this.ctx.currentTime, ar = Math.max(0.0001, Math.abs(this.rate));
      this.src.playbackRate.setTargetAtTime(ar, now, 0.012);
      // soften very slow speeds a touch, like a real cartridge
      this.tone.frequency.setTargetAtTime(Math.min(20000, 600 + ar * 16000), now, 0.03);
      this.crackle.gain.setTargetAtTime(0.05 * Math.min(1, ar), now, 0.05);
    } else if (this.crackle) {
      this.crackle.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
    const degPerSec = 200; // 33⅓ rpm
    return { rec: this.rate * degPerSec * dt, plat: this.motor * degPerSec * dt };
  }

  levels() {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.freq);
    return this.freq;
  }
}

export { RPM_BASE, RPM_45 };
