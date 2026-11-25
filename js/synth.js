// Sound generation for the records. Pure JavaScript (no Web Audio), so it can
// run inside a Web Worker and never block the page. Each record is rendered
// once into a seamless stereo loop.

import { rng } from './covers.js';

export const SR = 32000;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- styles
// Steps are 16ths within a bar. Bass: [step, lengthInSteps, semitoneOffset].
const PROGS = {
  minor:  [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 10]],
  jazzy:  [[2, 5, 9, 12, 16], [-5, -1, 2, 5, 9], [0, 4, 7, 11, 14], [-3, 0, 4, 7, 11]],
  major:  [[0, 4, 7, 11], [-3, 0, 4, 7], [5, 9, 12, 16], [7, 11, 14, 17]],
  anthem: [[-3, 0, 4, 7], [-7, -3, 0, 4], [0, 4, 7, 12], [-5, -1, 2, 7]],
  dorian: [[0, 3, 7, 10, 14], [5, 9, 12, 15, 19]],
  afro:   [[0, 3, 7, 10], [5, 8, 12, 15]],
  one:    [[0, 3, 7, 10]],
};

const FOUR = [0, 4, 8, 12];
const OFF = [2, 6, 10, 14];
const ALL16 = [...Array(16).keys()];
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];

const STYLES = {
  lofi: {
    swing: 0.6, kick: [0, 7, 10], kickV: 0.8, snare: [4, 12], snareType: 'snare', snareV: 0.45,
    hats: EIGHTHS, hatV: 0.16, prog: 'jazzy', perChord: 1,
    bass: { pat: [[0, 6, 0], [10, 4, 0], [14, 2, 7]], wave: 'triangle', cut: 500, env: 300, v: 0.55 },
    chords: { type: 'rhodes', hits: [[0, 7], [8, 7]], oct: 0, v: 0.2 },
    lead: { type: 'rhodes', every: 2, v: 0.14 }, masterLP: 3600, crackle: 0.05, kickDecay: 0.32,
  },
  boombap: {
    swing: 0.57, kick: [0, 3, 10], kickAlt: [0, 3, 8, 10], kickV: 1, snare: [4, 12], snareType: 'both', snareV: 0.6,
    hats: EIGHTHS, hatV: 0.2, ghost: [15], prog: 'minor', perChord: 2,
    bass: { pat: [[0, 3, 0], [3, 3, 0], [10, 5, 0]], wave: 'sawtooth', cut: 380, env: 500, v: 0.55 },
    chords: { type: 'rhodes', hits: [[0, 6], [8, 6]], oct: 0, v: 0.17 },
    lead: { type: 'bell', every: 2, v: 0.1 }, masterLP: 9000, crackle: 0.02, kickDecay: 0.38,
  },
  rnb: {
    swing: 0.54, kick: [0, 7, 9], kickV: 0.95, snare: [4, 12], snareType: 'clap', snareV: 0.5,
    hats: ALL16, hatV: 0.13, rolls: true, prog: 'jazzy', perChord: 1,
    bass: { pat: [[0, 7, 0], [9, 6, 0]], wave: 'sine', cut: 300, env: 100, v: 0.7, sub: true },
    chords: { type: 'pad', hits: [[0, 16]], oct: 0, v: 0.1 }, chords2: { type: 'rhodes', hits: [[0, 3], [6, 2], [10, 4]], v: 0.12 },
    masterLP: 12000, kickDecay: 0.45,
  },
  disco: {
    swing: 0.5, kick: FOUR, kickV: 1, snare: [4, 12], snareType: 'both', snareV: 0.5,
    hats: ALL16, hatV: 0.1, openHats: OFF, prog: 'major', perChord: 1, sidechain: 0.25,
    bass: { pat: [[0, 2, 0], [2, 2, 12], [4, 2, 0], [6, 2, 12], [8, 2, 0], [10, 2, 12], [12, 2, 0], [14, 2, 12]], wave: 'sawtooth', cut: 700, env: 1400, v: 0.42 },
    chords: { type: 'strings', hits: [[0, 16]], oct: 12, v: 0.07 }, chords2: { type: 'stab', hits: [[2, 1], [6, 1], [10, 1], [14, 1]], v: 0.12 },
    lead: { type: 'pluck', every: 1, v: 0.1 }, kickDecay: 0.32,
  },
  nudisco: {
    swing: 0.5, kick: FOUR, kickV: 1, snare: [4, 12], snareType: 'clap', snareV: 0.45,
    hats: ALL16, hatV: 0.08, openHats: OFF, shaker: true, prog: 'minor', perChord: 2, sidechain: 0.45,
    bass: { pat: [[0, 3, 0], [3, 1, 0], [6, 2, 12], [10, 3, 0], [14, 2, 7]], wave: 'sawtooth', cut: 420, env: 900, v: 0.5 },
    chords: { type: 'pad', hits: [[0, 32]], oct: 0, v: 0.08 },
    arp: { v: 0.07 }, kickDecay: 0.34,
  },
  afro: {
    swing: 0.52, kick: FOUR, kickV: 0.9, snare: [4, 12], snareType: 'clap', snareV: 0.3,
    hats: OFF, hatV: 0.15, shaker: true, rim: [3, 6, 11, 14],
    percs: [[3, 330], [6, 220], [7, 220], [11, 330], [14, 220], [15, 262]], prog: 'afro', perChord: 2, sidechain: 0.4,
    bass: { pat: [[0, 2, 0], [3, 2, 0], [6, 3, 7], [10, 2, 0], [12, 3, -2]], wave: 'square', cut: 340, env: 500, v: 0.38, logdrum: true },
    chords: { type: 'pad', hits: [[0, 32]], oct: 0, v: 0.07 },
    lead: { type: 'marimba', every: 1, v: 0.13 }, kickDecay: 0.3,
  },
  deephouse: {
    swing: 0.53, kick: FOUR, kickV: 1, snare: [4, 12], snareType: 'clap', snareV: 0.42,
    hats: ALL16, hatV: 0.07, openHats: OFF, prog: 'dorian', perChord: 2, sidechain: 0.5,
    bass: { pat: [[2, 2, 0], [6, 2, 0], [10, 2, 0], [13, 1, 0], [14, 2, 0]], wave: 'triangle', cut: 260, env: 300, v: 0.6 },
    chords: { type: 'stab', hits: [[0, 1.5], [3, 1], [6, 1.5], [10, 1]], oct: 0, v: 0.12, delay: true },
    chords2: { type: 'pad', hits: [[0, 32]], v: 0.04 }, kickDecay: 0.38,
  },
  house: {
    swing: 0.5, kick: FOUR, kickV: 1, snare: [4, 12], snareType: 'clap', snareV: 0.5,
    hats: ALL16, hatV: 0.08, openHats: OFF, prog: 'major', perChord: 1, sidechain: 0.55,
    bass: { pat: [[2, 2, 0], [6, 2, 0], [10, 2, 0], [14, 2, 0]], wave: 'sawtooth', cut: 520, env: 900, v: 0.42 },
    chords: { type: 'piano', hits: [[0, 1], [3, 1], [6, 1], [8, 1], [11, 1], [14, 1]], oct: 12, v: 0.1 },
    lead: { type: 'pluck', every: 1, v: 0.08 }, kickDecay: 0.33,
  },
  openformat: {
    swing: 0.5, kick: FOUR, kickV: 1, snare: [4, 12], snareType: 'both', snareV: 0.5,
    hats: EIGHTHS, hatV: 0.12, openHats: OFF, prog: 'minor', perChord: 1, sidechain: 0.45,
    bass: { pat: [[0, 2, 0], [3, 2, 0], [6, 2, 0], [8, 2, 0], [11, 2, 0], [14, 2, 12]], wave: 'square', cut: 600, env: 800, v: 0.38 },
    chords: { type: 'stab', hits: [[0, 2], [3, 2], [6, 2], [10, 2], [12, 2]], oct: 0, v: 0.11 },
    lead: { type: 'saw', every: 1, v: 0.07 }, kickDecay: 0.32,
  },
  anthem: {
    swing: 0.5, kick: FOUR, kickV: 1, snare: [4, 12], snareType: 'clap', snareV: 0.5,
    hats: ALL16, hatV: 0.08, openHats: OFF, prog: 'anthem', perChord: 1, sidechain: 0.7,
    bass: { pat: [[2, 2, 0], [6, 2, 0], [10, 2, 0], [14, 2, 0]], wave: 'sawtooth', cut: 900, env: 1200, v: 0.4 },
    chords: { type: 'supersaw', hits: [[0, 16]], oct: 0, v: 0.05 },
    lead: { type: 'pluck', every: 1, v: 0.11 }, riser: true, kickDecay: 0.32,
  },
  techno: {
    swing: 0.5, kick: FOUR, kickV: 1.1, snare: [4, 12], snareType: 'clap', snareV: 0.35,
    hats: ALL16, hatV: 0.1, openHats: OFF, rim: [3, 7, 11, 15], prog: 'one', perChord: 4, sidechain: 0.35,
    bass: { pat: [[1, 1, 0], [2, 1, 0], [3, 1, 0], [5, 1, 0], [6, 1, 0], [7, 1, 0], [9, 1, 0], [10, 1, 0], [11, 1, 0], [13, 1, 0], [14, 1, 0], [15, 1, 0]], wave: 'sawtooth', cut: 180, env: 380, v: 0.42 },
    chords: { type: 'stab', hits: [[3, 1], [10, 1]], oct: 0, v: 0.08, delay: true },
    acid: { v: 0.11 }, riser: true, kickDecay: 0.45, rumble: true,
  },
  dnb: {
    swing: 0.5, kick: [0, 10], kickAlt: [0, 7, 10], kickV: 1, snare: [4, 12], snareType: 'snare', snareV: 0.7,
    hats: EIGHTHS, hatV: 0.13, shaker: true, ghost: [7, 9, 14], prog: 'minor', perChord: 2,
    bass: { pat: [[0, 10, 0], [10, 6, 0]], wave: 'reese', cut: 340, env: 200, v: 0.38 },
    chords: { type: 'pad', hits: [[0, 32]], oct: 0, v: 0.08 },
    lead: { type: 'pluck', every: 2, v: 0.08 }, kickDecay: 0.3,
  },
};

function pickBars(bpm) {
  return Math.max(8, Math.round((30 * bpm) / 240 / 8) * 8);
}

/** Walk the arrangement and return drum + music events (times in seconds). */
function arrange(rec, S, bars, step, bar) {
  const R = rng(rec.cat + 'audio');
  const drums = [], music = [];
  const D = (k, t, v, pan = 0) => drums.push({ k, t, v, pan });
  const prog = PROGS[S.prog];
  const root = rec.key;
  const breakStart = Math.round(bars * 0.375), breakEnd = Math.round(bars * 0.5);
  const hasBreak = bars >= 16 && !['lofi', 'boombap', 'rnb'].includes(rec.style);
  const swingOff = (s) => (s % 2 ? (S.swing - 0.5) * 2 * step : 0);
  const tAt = (b, s) => b * bar + s * step + swingOff(Math.floor(s));

  const motif = [];
  for (let s = 0; s < 32; s += 2) if (R() > 0.42) motif.push({ s, len: R() > 0.7 ? 4 : 2, idx: Math.floor(R() * 4), oct: R() > 0.75 ? 12 : 0 });
  const acid = [];
  for (let s = 0; s < 16; s++) acid.push({ on: R() > 0.25, n: [0, 0, 12, 3, 7, 10, 0, -2][Math.floor(R() * 8)], acc: R() > 0.7 });

  for (let b = 0; b < bars; b++) {
    const inBreak = hasBreak && b >= breakStart && b < breakEnd;
    const build = hasBreak && b === breakEnd - 1;
    const lastBar = b === bars - 1;
    const secondHalf = hasBreak ? b >= breakEnd : b >= bars / 2;
    const chord = prog[Math.floor(b / S.perChord) % prog.length];
    const cRoot = root + chord[0] - 12 * (chord[0] > 4 ? 1 : 0);

    if (!inBreak) {
      const kp = S.kickAlt && b % 4 === 3 ? S.kickAlt : S.kick;
      kp.forEach((s) => D('kick', tAt(b, s), S.kickV * (s === 0 ? 1 : 0.92)));
    }
    if (!inBreak || build) {
      (S.snare || []).forEach((s) => {
        const t = tAt(b, s), v = S.snareV;
        if (S.snareType === 'clap' || S.snareType === 'both') D('clap', t, v * (S.snareType === 'both' ? 0.7 : 1));
        if (S.snareType === 'snare' || S.snareType === 'both') D('snare', t, v);
      });
      (S.ghost || []).forEach((s) => D('snare', tAt(b, s), S.snareV * 0.22));
    }
    if (build) for (let s = 0; s < 16; s++) D('snare', tAt(b, s), 0.1 + (s / 16) * 0.4);
    if (!inBreak) {
      S.hats.forEach((s, i) => D('hat' + (i % 3), tAt(b, s), S.hatV * (s % 4 === 2 ? 1 : 0.65) * (0.8 + R() * 0.4), s % 2 ? 0.18 : -0.12));
      if (S.rolls && b % 2 === 1) [14.5, 15, 15.5].forEach((s) => D('hat1', b * bar + s * step, S.hatV * 0.8, 0.2));
      (S.openHats || []).forEach((s) => D('ohat', tAt(b, s), S.hatV * 1.4, 0.15));
      (S.rim || []).forEach((s) => D('rim', tAt(b, s), 0.12, -0.25));
      (S.percs || []).forEach(([s, f]) => D('conga' + f, tAt(b, s), 0.3, f > 250 ? 0.3 : -0.3));
      if (lastBar && !hasBreak) [12, 13, 14, 15].forEach((s) => D('snare', tAt(b, s), 0.18 + (s - 12) * 0.08));
    }
    if (S.shaker) ALL16.forEach((s) => D('shaker', tAt(b, s), 0.06 * (s % 2 ? 0.7 : 1), 0.3));
    if (S.riser && hasBreak && b === breakStart) D('riser', breakStart * bar, 0.2);
    if (hasBreak && b === breakEnd) D('crash', tAt(b, 0), 0.18, 0.1);
    if (!hasBreak && b === 0) D('crash', 0, 0.1, 0.1);

    if (!inBreak) S.bass.pat.forEach(([s, l, off]) => music.push({ y: 'bass', t: tAt(b, s), m: cRoot - 12 + off, dur: l * step, B: S.bass }));

    const doChords = (C) => {
      if (!C) return;
      if (C.hits[0][1] >= 32 && b % 2) return;
      C.hits.forEach(([s, l]) => music.push({ y: 'chord', t: tAt(b, s), ms: chord.map((n) => root + n + (C.oct || 0)), dur: l * step, C }));
    };
    doChords(S.chords);
    if (!inBreak || S.chords2?.type === 'pad') doChords(S.chords2);

    if (S.lead && (secondHalf || inBreak) && b % (S.lead.every || 1) === 0) {
      motif.forEach((n) => {
        if (n.s >= 16 * (S.lead.every === 2 ? 2 : 1)) return;
        const bb = b + Math.floor(n.s / 16);
        if (bb >= bars) return;
        const ch = prog[Math.floor(bb / S.perChord) % prog.length];
        music.push({ y: 'lead', t: tAt(bb, n.s % 16), m: root + 12 + ch[n.idx % ch.length] + n.oct, dur: n.len * step, type: S.lead.type, v: S.lead.v });
      });
    }
    if (S.arp && (!inBreak || build)) for (let s = 0; s < 16; s++) music.push({ y: 'lead', t: tAt(b, s), m: root + 12 + chord[s % chord.length] + (s % 8 > 3 ? 12 : 0), dur: step * 0.9, type: 'pluck', v: S.arp.v });
    if (S.acid && (secondHalf || b < breakStart)) acid.forEach((n, s) => { if (n.on) music.push({ y: 'acid', t: tAt(b, s), m: root - 12 + n.n, dur: step, acc: n.acc, v: S.acid.v }); });
  }
  return { drums, music, breakStart, breakEnd };
}


// ------------------------------------------------------------ tonal synths
// Plain-JS versions of the instruments, so a whole record renders inside a
// Web Worker without touching the page's main thread.

const TAU = Math.PI * 2;
const dB = (q) => Math.pow(10, q / 20);      // Web Audio lowpass Q is in dB

/** band-limited step correction for saw / square oscillators */
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** add an oscillator into `out` (mono) — freq may be a number or Float32Array */
function osc(out, type, freq, gain = 1, detuneCents = 0) {
  const k = Math.pow(2, detuneCents / 1200);
  let ph = Math.random();
  const n = out.length, arr = typeof freq !== 'number';
  for (let i = 0; i < n; i++) {
    const f = (arr ? freq[i] : freq) * k, dt = f / SR;
    let v;
    if (type === 'sawtooth') v = 2 * ph - 1 - blep(ph, dt);
    else if (type === 'square') { const p2 = ph + 0.5 - (ph + 0.5 >= 1 ? 1 : 0); v = (ph < 0.5 ? 1 : -1) + blep(ph, dt) - blep(p2, dt); }
    else if (type === 'triangle') v = 1 - 4 * Math.abs(ph - 0.5);
    else v = Math.sin(TAU * ph);
    out[i] += v * gain;
    ph += dt; if (ph >= 1) ph -= 1;
  }
}

/** piecewise envelope: env(n, start).exp(to, s).lin(to, s).hold(s).tail(tau) */
function env(n, v0 = 0.0001) {
  const a = new Float32Array(n);
  let i = 0, v = v0;
  const api = {
    a,
    exp(to, s) { const m = Math.max(1, Math.round(s * SR)); const r = Math.pow(Math.max(to, 1e-4) / Math.max(v, 1e-4), 1 / m); for (let k = 0; k < m && i < n; k++) { v *= r; a[i++] = v; } v = Math.max(to, 1e-4); return api; },
    lin(to, s) { const m = Math.max(1, Math.round(s * SR)); const d = (to - v) / m; for (let k = 0; k < m && i < n; k++) { v += d; a[i++] = v; } v = to; return api; },
    hold(s) { const m = Math.round(s * SR); for (let k = 0; k < m && i < n; k++) a[i++] = v; return api; },
    until(s) { return api.hold(Math.max(0, s - i / SR)); },
    tail(tau) { const r = Math.exp(-1 / (tau * SR)); while (i < n) { v *= r; a[i++] = v; } return api; },
  };
  return api;
}

/** time-varying resonant lowpass (cutoff curve sampled every 32 samples) */
function lowpass(x, cutoff, qLin) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  const arr = typeof cutoff !== 'number';
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) {
      const f = Math.min(SR * 0.45, Math.max(30, arr ? cutoff[i] : cutoff));
      const w = (TAU * f) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * qLin), a0 = 1 + al;
      b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; b2 = b0; a1 = (-2 * c) / a0; a2 = (1 - al) / a0;
    }
    const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

/** exponential curve from a to b over s seconds, then holding b */
function curve(n, a, b, s) {
  const c = new Float32Array(n), m = Math.max(1, Math.round(s * SR)), r = Math.pow(b / a, 1 / m);
  let v = a;
  for (let i = 0; i < n; i++) { c[i] = v; if (i < m) v *= r; }
  return c;
}

function mul(x, e) { for (let i = 0; i < x.length; i++) x[i] *= e[i]; return x; }

// ---- instruments: each returns a mono Float32Array starting at the note-on

function bassVoice(m, dur, B) {
  const len = Math.max(0.06, dur - 0.01), n = Math.ceil((len + 0.05) * SR);
  const f = hz(m);
  const filt = new Float32Array(n), dry = new Float32Array(n);
  let cut;
  if (B.wave === 'reese') {
    osc(filt, 'sawtooth', f, 1, -14); osc(filt, 'sawtooth', f, 1, 14);
    osc(dry, 'sine', hz(m - 12), 0.9);
    cut = curve(n, B.cut + B.env, Math.max(60, B.cut), 0.18);
    const pk = Math.round(dur * 0.6 * SR), end = Math.round(dur * SR);
    for (let i = Math.round(0.18 * SR); i < n; i++) cut[i] = i < pk ? B.cut + (B.cut * 1.2 * (i / pk)) : i < end ? B.cut * 2.2 - (B.cut * 1.2 * (i - pk)) / (end - pk) : B.cut;
  } else if (B.logdrum) {
    osc(dry, 'sine', curve(n, f * 1.6, f, 0.05), 1);
    osc(filt, 'square', f);
    cut = curve(n, B.cut + B.env, Math.max(60, B.cut), 0.18);
  } else {
    osc(filt, B.wave, f);
    if (B.sub || B.wave !== 'sine') osc(dry, 'sine', f, 0.5);
    cut = curve(n, B.cut + B.env, Math.max(60, B.cut), 0.18);
  }
  lowpass(filt, cut, dB(B.wave === 'reese' ? 2 : 5));
  for (let i = 0; i < n; i++) filt[i] += dry[i];
  const e = env(n).exp(B.v, 0.006).until(len * 0.7).lin(B.v * (B.logdrum ? 0.4 : 0.85), 0.001).exp(0.0001, len * 0.3).tail(0.01).a;
  return mul(filt, e);
}

function rhodesVoice(m, dur, v) {
  const n = Math.ceil((dur + 0.8) * SR), f = hz(m), out = new Float32Array(n);
  const idx = curve(n, f * 1.4, f * 0.05, 0.6);
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const fm = f + idx[i] * Math.sin(TAU * pm);
    out[i] = Math.sin(TAU * pc);
    pc += fm / SR; pm += f / SR;
    if (pc > 1e6) pc -= 1e6;
  }
  const e = env(n).exp(v, 0.006).exp(v * 0.35, 0.9).until(dur).tail(0.12).a;
  return mul(out, e);
}

function chordVoice(ms, dur, C) {
  const type = C.type;
  if (type === 'rhodes') {
    const n = Math.ceil((dur + 0.8) * SR), out = new Float32Array(n);
    for (const m of ms) { const r = rhodesVoice(m, dur, C.v); for (let i = 0; i < r.length; i++) out[i] += r[i]; }
    return out;
  }
  let stop, waves = ['sawtooth'], det = [0], cut, q = 0.7, e;
  if (type === 'pad' || type === 'strings') {
    stop = dur + 0.7; det = [-9, 9];
    const n = Math.ceil(stop * SR);
    cut = type === 'pad' ? 1100 : 3200; q = dB(0.5);
    const a = type === 'pad' ? Math.min(1.2, dur * 0.3) : 0.25;
    e = env(n).exp(C.v, a).until(dur * 0.85).exp(0.0001, dur * 0.15 + 0.6).tail(0.05).a;
  } else if (type === 'supersaw') {
    stop = dur + 0.35; det = [-20, -7, 7, 20];
    const n = Math.ceil(stop * SR);
    cut = 4200; e = env(n).exp(C.v, 0.02).until(dur - 0.05).exp(0.0001, 0.35).tail(0.05).a;
  } else { // stab / piano
    stop = dur + 0.4; det = [-6, 6];
    waves = type === 'piano' ? ['triangle', 'square'] : ['sawtooth', 'square'];
    const n = Math.ceil(stop * SR);
    cut = curve(n, type === 'piano' ? 5000 : 2600, type === 'piano' ? 900 : 500, 0.25);
    e = env(n).exp(C.v, 0.003).exp(0.0001, Math.max(0.12, dur * 0.9)).tail(0.02).a;
  }
  const n = Math.ceil(stop * SR), out = new Float32Array(n);
  for (const m of ms) det.forEach((d, i) => osc(out, waves[i % waves.length], hz(m) * (type === 'piano' && i ? 2 : 1), 1, d));
  lowpass(out, cut, q);
  return mul(out, e);
}

function leadVoice(m, dur, type, v) {
  if (type === 'rhodes') return rhodesVoice(m, dur, v);
  const n = Math.ceil((dur + 0.6) * SR), out = new Float32Array(n), f = hz(m);
  if (type === 'bell' || type === 'marimba') {
    osc(out, 'sine', f, 1);
    const over = new Float32Array(n);
    osc(over, 'sine', f * (type === 'bell' ? 3.01 : 4), 1);
    const oe = type === 'bell' ? env(n).exp(v * 0.3, 0.002).exp(0.0001, 0.4).tail(0.02).a : env(n).exp(v * 0.25, 0.001).exp(0.0001, 0.05).tail(0.01).a;
    const e = env(n).exp(v, type === 'bell' ? 0.003 : 0.003).exp(0.0001, type === 'marimba' ? 0.35 : Math.max(0.15, dur)).tail(0.02).a;
    for (let i = 0; i < n; i++) out[i] = out[i] * e[i] + over[i] * oe[i];
    if (type === 'marimba') lowpass(out, 3000, 0.7);
    return out;
  }
  if (type === 'saw') { osc(out, 'sawtooth', f); lowpass(out, curve(n, 3000, 700, 0.2), 0.7); }
  else { osc(out, 'triangle', f); lowpass(out, curve(n, 4500, 900, 0.18), 0.7); }
  return mul(out, env(n).exp(v, 0.003).exp(0.0001, Math.max(0.15, dur)).tail(0.02).a);
}

function acidVoice(m, dur, accent, v) {
  const n = Math.ceil((dur + 0.1) * SR), out = new Float32Array(n);
  osc(out, 'sawtooth', hz(m));
  lowpass(out, curve(n, accent ? 2600 : 1200, 260, 0.14), dB(14));
  return mul(out, env(n).exp(v * (accent ? 1.3 : 0.9), 0.003).exp(0.0001, dur * 0.9).tail(0.01).a);
}

// ---- effects (run over the loop twice so tails wrap seamlessly)

function delayLoop(send, L, time) {
  const d = Math.round(time * SR), buf = new Float32Array(d), out = new Float32Array(L);
  let w = 0, lp = 0;
  const a = 1 - Math.exp((-TAU * 2400) / SR);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < L; i++) {
    const y = buf[w];
    lp += a * (y - lp);
    buf[w] = send[i] + lp * 0.36;
    if (pass) out[i] = lp;
    w = w + 1 === d ? 0 : w + 1;
  }
  return out;
}

/** compact Freeverb: 4 combs + 2 allpasses per channel */
function reverbLoop(send, L) {
  const s = SR / 44100;
  const make = (combs, aps) => ({
    c: combs.map((n) => ({ b: new Float32Array(Math.round(n * s)), i: 0, f: 0 })),
    a: aps.map((n) => ({ b: new Float32Array(Math.round(n * s)), i: 0 })),
  });
  const chans = [make([1116, 1277, 1422, 1557], [556, 341]), make([1139, 1300, 1445, 1580], [579, 364])];
  const fb = 0.84, damp = 0.28, out = [new Float32Array(L), new Float32Array(L)];
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < L; i++) {
    const x = send[i] * 0.05;
    for (let ch = 0; ch < 2; ch++) {
      const R = chans[ch];
      let acc = 0;
      for (const c of R.c) {
        const y = c.b[c.i];
        c.f = y * (1 - damp) + c.f * damp;
        c.b[c.i] = x + c.f * fb;
        c.i = c.i + 1 === c.b.length ? 0 : c.i + 1;
        acc += y;
      }
      for (const ap of R.a) {
        const bo = ap.b[ap.i];
        ap.b[ap.i] = acc + bo * 0.5;
        acc = bo - acc;
        ap.i = ap.i + 1 === ap.b.length ? 0 : ap.i + 1;
      }
      if (pass) out[ch][i] = acc;
    }
  }
  return out;
}

/** render every tonal event of the arrangement into a looping stereo bus */
function renderMusic(S, events, L, spb) {
  const music = new Float32Array(L), rev = new Float32Array(L), del = new Float32Array(L);
  const add = (buf, v, t, g) => { const s0 = Math.round(t * SR); for (let i = 0; i < v.length; i++) buf[(s0 + i) % L] += v[i] * g; };
  for (const e of events) {
    let v, revS = 0, delS = 0;
    if (e.y === 'bass') v = bassVoice(e.m, e.dur, e.B);
    else if (e.y === 'chord') {
      v = chordVoice(e.ms, e.dur, e.C);
      revS = e.C.type === 'pad' || e.C.type === 'strings' ? 0.8 : 0.35;
      delS = e.C.delay ? 0.6 : 0;
    } else if (e.y === 'lead') { v = leadVoice(e.m, e.dur, e.type, e.v); delS = 0.5; revS = e.type === 'rhodes' ? 0.35 : 0; }
    else if (e.y === 'acid') { v = acidVoice(e.m, e.dur, e.acc, e.v); delS = 0.35; }
    if (!v) continue;
    add(music, v, e.t, 1);
    if (revS) add(rev, v, e.t, revS);
    if (delS) add(del, v, e.t, delS * 0.4);
  }
  const d = delayLoop(del, L, spb * 0.75);
  for (let i = 0; i < L; i++) music[i] += d[i];
  const r = reverbLoop(rev, L);
  return { music, reverb: r };
}


// ---------------------------------------------------------------- mixdown
const REVERB_RETURN = 0.55;

/** Render a record. Returns { sr, channels: [Float32Array, Float32Array] }. */
export function renderAll(rec) {
  const S = STYLES[rec.style];
  const spb = 60 / rec.bpm, step = spb / 4, bar = spb * 4;
  const bars = pickBars(rec.bpm);
  const L = Math.round(bars * bar * SR);
  const plan = arrange(rec, S, bars, step, bar);

  const { music, reverb } = renderMusic(S, plan.music, L, spb);

  // sidechain the music (not the reverb) from the kicks
  if (S.sidechain) {
    const duck = new Float32Array(L).fill(1);
    const tau = spb * 0.2, n = Math.round(spb * SR);
    for (const e of plan.drums) if (e.k === 'kick') {
      const s0 = Math.round(e.t * SR);
      for (let i = 0; i < n; i++) {
        const t = i / SR, v = 1 - S.sidechain * Math.min(1, t / 0.004) * Math.exp(-t / tau), k = (s0 + i) % L;
        if (v < duck[k]) duck[k] = v;
      }
    }
    for (let i = 0; i < L; i++) music[i] *= duck[i];
  }
  const out = [new Float32Array(L), new Float32Array(L)];
  for (let ch = 0; ch < 2; ch++) { const o = out[ch], r = reverb[ch]; for (let i = 0; i < L; i++) o[i] = music[i] * 0.9 + r[i] * REVERB_RETURN; }

  // drums
  const kit = makeKit(S, rec, plan, bar);
  const DRUM_GAIN = { kick: 0.95, clap: 1.0, snare: 1.0, hat0: 1.9, hat1: 1.9, hat2: 1.9, ohat: 1.5, rim: 1.8, shaker: 2.4, crash: 1.4, riser: 1 };
  for (const e of plan.drums) {
    const smp = kit[e.k] || (e.k.startsWith('conga') ? (kit[e.k] = conga(+e.k.slice(5))) : null);
    if (!smp) continue;
    const g = e.v * (DRUM_GAIN[e.k] ?? 1.3);
    const gl = g * Math.min(1, 1 - e.pan), gr = g * Math.min(1, 1 + e.pan);
    const s0 = Math.round(e.t * SR);
    for (let i = 0; i < smp.length; i++) { const k = (s0 + i) % L; out[0][k] += smp[i] * gl; out[1][k] += smp[i] * gr; }
  }

  if (S.crackle) for (let ch = 0; ch < 2; ch++) addCrackle(out[ch], S.crackle);

  // master: tone, glue, normalise
  if (S.masterLP) for (let ch = 0; ch < 2; ch++) filterLoop(out[ch], biquad('lowpass', S.masterLP, 0.5));
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(out[ch][i]));
  const pre = 1.5 / (peak || 1), norm = 0.9 / Math.tanh(1.5);
  for (let ch = 0; ch < 2; ch++) { const o = out[ch]; for (let i = 0; i < L; i++) o[i] = Math.tanh(o[i] * pre) * norm; }
  return { sr: SR, channels: out };
}

// ---------------------------------------------------------------- JS dsp
function biquad(type, f, q) {
  const w = (2 * Math.PI * f) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  else if (type === 'highpass') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = a; b1 = 0; b2 = -a; }
  const a0 = 1 + a;
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - a) / a0];
}
function filter(x, co, state = [0, 0, 0, 0]) {
  let [x1, x2, y1, y2] = state;
  const [b0, b1, b2, a1, a2] = co;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
  }
  return [x1, x2, y1, y2];
}
/** filter a loop so its start continues seamlessly from its end */
function filterLoop(x, co) {
  const pre = x.slice(x.length - 4096);
  const st = filter(pre, co);
  filter(x, co, st);
}
const noiseArr = (n) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; return a; };
const normPeak = (a, p = 1) => { let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); if (m) for (let i = 0; i < a.length; i++) a[i] *= p / m; return a; };

function shapedNoise(len, type, f, q, envFn) {
  const n = Math.ceil(len * SR), a = noiseArr(n);
  filter(a, biquad(type, f, q));
  for (let i = 0; i < n; i++) a[i] *= envFn(i / SR);
  return normPeak(a);
}

function conga(f0) {
  const n = Math.ceil(0.32 * SR), a = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; const f = f0 * (1 + 0.25 * Math.exp(-t / 0.012)); ph += (2 * Math.PI * f) / SR; a[i] = Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / 0.07); }
  return normPeak(a);
}

function makeKit(S, rec, plan, bar) {
  const kit = {};
  // kick
  {
    const dec = S.kickDecay || 0.35, n = Math.ceil((dec + 0.08) * SR), a = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, f = 46 + 124 * Math.exp(-t / 0.026);
      ph += (2 * Math.PI * f) / SR;
      a[i] = Math.sin(ph) * Math.min(1, t / 0.0015) * Math.exp((-t * 6.2) / dec) + (Math.random() * 2 - 1) * 0.2 * Math.exp(-t / 0.002);
    }
    if (S.rumble) { const r = shapedNoise(dec + 0.08, 'lowpass', 120, 0.8, (t) => Math.exp(-t / 0.12) * Math.min(1, t / 0.03)); for (let i = 0; i < n; i++) a[i] += r[i] * 0.25; }
    kit.kick = normPeak(a);
  }
  for (let v = 0; v < 3; v++) kit['hat' + v] = shapedNoise(0.07, 'highpass', 7800 + v * 400, 0.8, (t) => Math.exp(-t / (0.009 + v * 0.002)));
  kit.ohat = shapedNoise(0.34, 'highpass', 7000, 0.7, (t) => Math.exp(-t / 0.07));
  kit.shaker = shapedNoise(0.08, 'bandpass', 6500, 1, (t) => Math.min(1, t / 0.008) * Math.exp(-t / 0.014));
  kit.crash = shapedNoise(1.8, 'highpass', 4200, 0.6, (t) => Math.exp(-t / 0.4));
  {
    const body = shapedNoise(0.9, 'bandpass', 1350, 1.3, (t) => {
      let e = 0; for (const o of [0, 0.011, 0.022]) if (t >= o) e = Math.max(e, Math.exp(-(t - o) / 0.006));
      if (t >= 0.03) e = Math.max(e, 0.85 * Math.exp(-(t - 0.03) / 0.055));
      return e;
    });
    const room = shapedNoise(0.9, 'lowpass', 2800, 0.5, (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.22));
    for (let i = 0; i < body.length; i++) body[i] += room[i] * 0.16;
    kit.clap = normPeak(body);
  }
  {
    const n = Math.ceil(0.4 * SR), a = shapedNoise(0.4, 'bandpass', 2200, 0.7, (t) => Math.exp(-t / 0.055));
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * (160 + 60 * Math.exp(-t / 0.02))) / SR; a[i] = a[i] * 0.8 + (2 / Math.PI) * Math.asin(Math.sin(ph)) * 0.65 * Math.exp(-t / 0.035); }
    kit.snare = normPeak(a);
  }
  {
    const n = Math.ceil(0.05 * SR), a = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; a[i] = (Math.sin(2 * Math.PI * 1750 * t) > 0 ? 1 : -1) * Math.exp(-t / 0.007); }
    filter(a, biquad('bandpass', 1800, 3));
    kit.rim = normPeak(a);
  }
  if (S.riser) {
    const len = (plan.breakEnd - plan.breakStart) * bar, n = Math.ceil(len * SR), a = noiseArr(n);
    let st = [0, 0, 0, 0];
    for (let i = 0; i < n; i += 64) {
      const p = i / n, seg = a.subarray(i, Math.min(n, i + 64));
      st = filter(seg, biquad('bandpass', 300 * Math.pow(7000 / 300, p), 2), st);
      for (let k = 0; k < seg.length; k++) seg[k] *= Math.pow(p + 0.001, 2.2);
    }
    kit.riser = normPeak(a);
  }
  return kit;
}


export function addCrackle(d, amt) {
  let lp = 0;
  for (let i = 0; i < d.length; i++) {
    lp = lp * 0.9 + (Math.random() * 2 - 1) * 0.1;
    d[i] += lp * amt * 0.5;
    if (Math.random() < 0.00016) { const a = (Math.random() * 0.6 + 0.2) * amt * 4; for (let k = 0; k < 30 && i + k < d.length; k++) d[i + k] += a * Math.exp(-k / 5) * (k % 2 ? -1 : 1); }
  }
}

