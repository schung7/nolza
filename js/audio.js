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
    buf.beat = analyzeBeats(buf);
    buf.bpm = buf.beat.bpm;
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

/**
 * Tempo and beat position from an onset envelope (bass-weighted) + autocorrelation.
 * Returns { bpm, period, phase } — phase is the time of a beat in seconds.
 * Octave errors (x2, /2) are common; the auto-mix only relies on tempo ratios.
 */
export function analyzeBeats(buf) {
  const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const fps = 200, hop = Math.round(buf.sampleRate / fps), n = Math.floor(a.length / hop);
  const env = new Float32Array(n);
  const c = 1 - Math.exp((-2 * Math.PI * 150) / buf.sampleRate);
  let lp = 0, prevF = 0, prevL = 0;
  for (let i = 0; i < n; i++) {
    let eF = 0, eL = 0;
    for (let k = i * hop, end = k + hop; k < end; k++) { const v = a[k] + b[k]; lp += c * (v - lp); eF += v * v; eL += lp * lp; }
    const f = Math.log(1 + eF), l = Math.log(1 + eL * 4);
    env[i] = Math.max(0, f - prevF) + 1.5 * Math.max(0, l - prevL);
    prevF = f; prevL = l;
  }
  // autocorrelation at each whole lag once, then refine around the peak
  const lo = Math.floor((60 * fps) / 180), hi = Math.ceil((60 * fps) / 70);
  const sc = new Float32Array(2 * hi + 3);
  for (let lag = lo; lag <= 2 * hi + 2 && lag < n - 1; lag++) { let s = 0; for (let i = lag; i < n; i++) s += env[i] * env[i - lag]; sc[lag] = s / (n - lag); }
  // a beat period should also line up at twice its length, and tempos near 120 are likelier
  const fit = (lag) => (sc[lag] + 0.5 * sc[2 * lag]) * Math.exp(-0.5 * Math.pow(Math.log2((60 * fps) / lag / 120) / 0.7, 2));
  let bestLag = lo;
  for (let lag = lo; lag <= hi; lag++) if (fit(lag) > fit(bestLag)) bestLag = lag;
  const y0 = fit(bestLag - 1) || 0, y1 = fit(bestLag), y2 = fit(bestLag + 1) || 0, den = y0 - 2 * y1 + y2;
  if (den) bestLag += Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)); // parabolic peak
  // beat phase: the offset whose beat grid collects the most onset energy
  let bestPh = 0, bestS = -1;
  for (let ph = 0; ph < bestLag; ph++) {
    let s = 0;
    for (let t = ph; t < n; t += bestLag) s += env[Math.round(t)] || 0;
    if (s > bestS) { bestS = s; bestPh = ph; }
  }
  let bpm = (60 * fps) / bestLag;
  while (bpm < 80) bpm *= 2;
  while (bpm > 165) bpm /= 2;
  const period = 60 / bpm;
  return { bpm: Math.round(bpm * 10) / 10, period, phase: (bestPh / fps) % period };
}

export const estimateBPM = (buf) => analyzeBeats(buf).bpm;

/**
 * Plan a beat-matched mix from the playing record into the next one.
 * Returns { ratio, beatMatched } — ratio is the playback-speed multiplier for
 * the incoming record (kept within ±8%, like a pitch fader), or a plain blend.
 */
export function planMix(outBeat, inBeat) {
  if (!outBeat || !inBeat) return { ratio: 1, beatMatched: false };
  let best = null;
  for (const m of [0.5, 2 / 3, 0.75, 1, 4 / 3, 1.5, 2]) {
    const r = outBeat.bpm / (inBeat.bpm * m);
    if (!best || Math.abs(Math.log(r)) < Math.abs(Math.log(best.ratio))) best = { ratio: r, m };
  }
  if (Math.abs(best.ratio - 1) > 0.08) return { ratio: 1, beatMatched: false };
  return { ratio: best.ratio, beatMatched: true, inPeriod: inBeat.period / best.m };
}

/** onset envelope of `buf` from t0 (buffer seconds), played at `rate`, over `dur` real seconds */
function onsetEnvelope(buf, t0, dur, rate, fps) {
  const a = buf.getChannelData(0), sr = buf.sampleRate, n = Math.floor(dur * fps), env = new Float32Array(n);
  const c = 1 - Math.exp((-2 * Math.PI * 120) / sr);
  let prev = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const s0 = Math.max(0, Math.floor((t0 + (i / fps) * rate) * sr)), s1 = Math.floor((t0 + ((i + 1) / fps) * rate) * sr);
    let e = 0;
    for (let k = s0; k < s1 && k < a.length; k++) { lp += c * (a[k] - lp); e += 0.25 * a[k] * a[k] + 4 * lp * lp; }
    const l = Math.log(1 + e * 8);
    env[i] = Math.max(0, l - prev); prev = l;
  }
  // light smoothing (~20 ms) so near-identical peaks don't flip the match
  const out = new Float32Array(n), w = Math.max(1, Math.round(fps * 0.01));
  for (let i = 0; i < n; i++) { let s = 0, c2 = 0; for (let k = i - w; k <= i + w; k++) if (k >= 0 && k < n) { s += env[k]; c2++; } out[i] = s / c2; }
  return out;
}

export { onsetEnvelope };

/**
 * Fine-tune a beat-matched mix by ear: slide the incoming record's onsets against
 * the end of the outgoing one (and try tiny tempo tweaks) to find where the beats
 * actually lock. Runs in small async steps so it never stalls the page.
 * Returns { ratio, offset } for a mix that starts when A is at `posA`.
 */
export async function alignMix(A, B, plan, posA, fade) {
  const fps = 250, ob = A.beat;
  const ea = onsetEnvelope(A, posA, fade, 1, fps);
  let best = null;
  for (const tweak of [1, 0.995, 1.005, 0.99, 1.01, 0.985, 1.015]) {
    await new Promise((r) => setTimeout(r, 0));
    const ratio = plan.ratio * tweak;
    if (Math.abs(ratio - 1) > 0.085) continue;
    const P = plan.inPeriod;                                 // incoming beat length (B seconds)
    const until = ((((ob.phase - posA) % ob.period) + ob.period) % ob.period);
    let o0 = ((((B.beat.phase - until * ratio) % P) + P) % P);
    while (o0 < 0.3 + P / 2) o0 += P;
    const start = o0 - P / 2;                                // search a whole beat around the grid guess
    const eb = onsetEnvelope(B, start, fade + ob.period, ratio, fps);
    const maxLag = Math.round(ob.period * fps);
    let bestLag = 0, bestS = -1;
    for (let lag = 0; lag <= maxLag; lag++) {
      let sum = 0;
      for (let k = 0; k < ea.length && k + lag < eb.length; k++) sum += ea[k] * eb[k + lag];
      if (sum > bestS) { bestS = sum; bestLag = lag; }
    }
    if (!best || bestS > best.score) best = { score: bestS, ratio, offset: start + (bestLag / fps) * ratio };
  }
  return best;
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
    // deck A: needle → crossfade → cartridge tone → out
    this.fadeA = ctx.createGain();
    this.needleGain.connect(this.fadeA).connect(this.tone).connect(this.out);
    // deck B: the next record, mixed in underneath before it takes over the platter
    this.mixGain = ctx.createGain(); this.mixGain.gain.value = 0;
    this.mixGain.connect(this.out);
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
    this.cancelMix();
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
        if (this.needle && !this.ended && !this.scratching && !this.mix) { this.ended = true; this.onEnd?.(); }
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
    // deck B follows the motor (and the pitch fader), not the hand on deck A
    const m = this.mix;
    if (m && this.ctx) {
      const r = Math.max(0.01, Math.abs(this.motor) * m.ratio);
      m.pos += r * dt;
      m.src.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.05);
      m.progress = Math.min(1, (this.ctx.currentTime - m.t0) / m.fade);
      if (m.progress >= 1 && !m.done) { m.done = true; this.onMixDone?.(); }
    }
    const degPerSec = 200; // 33⅓ rpm
    return { rec: this.rate * degPerSec * dt, plat: this.motor * degPerSec * dt };
  }

  /** start the next record underneath this one and crossfade over `fade` seconds */
  startMix(buf, { ratio = 1, offset = 0, fade = 8 } = {}) {
    if (!this.ctx || this.mix) return false;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = Math.max(0.01, Math.abs(this.motor) * ratio);
    s.connect(this.mixGain);
    s.start(t, Math.max(0, offset));
    // equal-power crossfade
    const N = 64, up = new Float32Array(N), down = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = i / (N - 1); up[i] = Math.sin((x * Math.PI) / 2); down[i] = Math.cos((x * Math.PI) / 2); }
    this.mixGain.gain.cancelScheduledValues(t); this.mixGain.gain.setValueCurveAtTime(up, t, fade);
    this.fadeA.gain.cancelScheduledValues(t); this.fadeA.gain.setValueCurveAtTime(down, t, fade);
    this.mix = { buf, src: s, ratio, pos: Math.max(0, offset), t0: t, fade, progress: 0, done: false };
    return true;
  }

  /** the mixed-in record takes over the platter, with no gap in the sound */
  adoptMix() {
    const m = this.mix;
    if (!m) return null;
    const t = this.ctx.currentTime;
    this.killSource();
    m.src.disconnect();
    m.src.connect(this.needleGain);
    this.mixGain.gain.cancelScheduledValues(t); this.mixGain.gain.setValueAtTime(0, t);
    this.fadeA.gain.cancelScheduledValues(t); this.fadeA.gain.setValueAtTime(1, t);
    this.buffer = m.buf; this.rev = null; this.pos = m.pos; this.played = 0;
    this.src = m.src; this.dir = 1; this.loop = false; this.ended = false;
    m.src.onended = () => { if (this.src === m.src) this.src = null; };
    // keep the matched tempo: it's now this record's pitch
    this.rate *= m.ratio; this.motor *= m.ratio;
    this.pitch = Math.max(-0.08, Math.min(0.08, (1 + this.pitch) * m.ratio - 1));
    this.mix = null;
    return { pitch: this.pitch };
  }

  /** abandon a mix in progress (record changed, stopped, needle lifted…) */
  cancelMix() {
    const m = this.mix;
    if (!m) return;
    const t = this.ctx.currentTime;
    this.mixGain.gain.cancelScheduledValues(t); this.mixGain.gain.setTargetAtTime(0, t, 0.06);
    this.fadeA.gain.cancelScheduledValues(t); this.fadeA.gain.setTargetAtTime(1, t, 0.06);
    try { m.src.stop(t + 0.4); } catch (e) {}
    this.mix = null;
  }

  levels() {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.freq);
    return this.freq;
  }
}

export { RPM_BASE, RPM_45 };
