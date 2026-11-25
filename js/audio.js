// Live audio: every record is synthesised in the browser (no audio files).
// A record is rendered once into a seamless loop with an OfflineAudioContext,
// then played by a Deck that behaves like a turntable — motor inertia,
// spin-up / spin-down, pitch fader, 33/45 and scratching (incl. backwards).

import { rng } from './covers.js';

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

// --------------------------------------------------------------- render
// Drums are synthesised straight into sample arrays (fast); only the tonal
// parts go through OfflineAudioContexts, rendered in parallel segments.
// Sidechain, mixing, loop-folding and mastering happen in plain JS.
const SR = 32000;
const cache = new Map();

export function renderRecord(rec) {
  if (!cache.has(rec.id)) cache.set(rec.id, doRender(rec));
  return cache.get(rec.id);
}

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

async function doRender(rec) {
  const S = STYLES[rec.style];
  const spb = 60 / rec.bpm, step = spb / 4, bar = spb * 4;
  const bars = pickBars(rec.bpm);
  const loopLen = bars * bar;
  const L = Math.round(loopLen * SR);
  const plan = arrange(rec, S, bars, step, bar);

  // ---- tonal parts: render in parallel segments
  const segs = bars >= 16 ? 4 : 2;
  const segBars = bars / segs;
  const tail = Math.max(3, 2 * bar + 1.5);
  const parts = await Promise.all([...Array(segs).keys()].map((i) => {
    const t0 = i * segBars * bar, t1 = (i + 1) * segBars * bar;
    const evs = plan.music.filter((e) => e.t >= t0 - 1e-6 && e.t < t1 - 1e-6);
    return renderMusic(rec, S, evs, t0, t1 - t0 + tail, spb).then((buf) => ({ buf, off: Math.round(t0 * SR) }));
  }));

  const out = [new Float32Array(L), new Float32Array(L)];
  const mus = [new Float32Array(L), new Float32Array(L)];
  for (const { buf, off } of parts) for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch), m = mus[ch];
    for (let i = 0; i < d.length; i++) m[(off + i) % L] += d[i];
  }

  // ---- sidechain the music bus from the kicks
  if (S.sidechain) {
    const duck = new Float32Array(L).fill(1);
    const tau = spb * 0.2, n = Math.round(spb * SR);
    for (const e of plan.drums) if (e.k === 'kick') {
      const s0 = Math.round(e.t * SR);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const v = 1 - S.sidechain * Math.min(1, t / 0.004) * Math.exp(-t / tau) - (t < 0.004 ? 0 : 0);
        const k = (s0 + i) % L;
        if (v < duck[k]) duck[k] = v;
      }
    }
    for (let ch = 0; ch < 2; ch++) for (let i = 0; i < L; i++) mus[ch][i] *= duck[i];
  }
  for (let ch = 0; ch < 2; ch++) out[ch].set(mus[ch]);

  // ---- drums
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

  // ---- surface noise for the dusty styles
  if (S.crackle) for (let ch = 0; ch < 2; ch++) addCrackle(out[ch], S.crackle);

  // ---- master: tone, glue, normalise
  if (S.masterLP) for (let ch = 0; ch < 2; ch++) filterLoop(out[ch], biquad('lowpass', S.masterLP, 0.5));
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(out[ch][i]));
  const pre = 1.5 / (peak || 1), norm = 0.9 / Math.tanh(1.5);
  const buf = new AudioBuffer({ length: L, numberOfChannels: 2, sampleRate: SR });
  for (let ch = 0; ch < 2; ch++) {
    const o = out[ch];
    for (let i = 0; i < L; i++) o[i] = Math.tanh(o[i] * pre) * norm;
    buf.copyToChannel(o, ch);
  }
  return buf;
}

async function renderMusic(rec, S, events, t0, len, spb) {
  const total = Math.ceil(len * SR);
  const ctx = new OfflineAudioContext(2, total, SR);

  const out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
  const music = ctx.createGain(); music.connect(out);
  const reverb = ctx.createConvolver(); reverb.buffer = impulse(ctx, 1.8, 3);
  const revIn = ctx.createGain(); revIn.gain.value = 0.3; revIn.connect(reverb).connect(out);
  const delay = ctx.createDelay(2); delay.delayTime.value = spb * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.36;
  const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
  const delIn = ctx.createGain(); delIn.gain.value = 0.4;
  delIn.connect(delay); delay.connect(dlp).connect(fb).connect(delay); dlp.connect(music);

  const env = (g, t, a, peak, dec) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  };

  const bassNote = (t, m, dur, B) => {
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = B.wave === 'reese' ? 2 : 5;
    f.frequency.setValueAtTime(B.cut + B.env, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, B.cut), t + 0.18);
    const oscs = [];
    const osc = (type, freq, detune = 0, viaFilter = true, level = 1) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
      if (viaFilter) o.connect(f); else { const lg = ctx.createGain(); lg.gain.value = level; o.connect(lg).connect(g); }
      oscs.push(o); return o;
    };
    if (B.wave === 'reese') {
      for (const d of [-14, 14]) osc('sawtooth', hz(m), d);
      f.frequency.linearRampToValueAtTime(B.cut * 2.2, t + dur * 0.6);
      f.frequency.linearRampToValueAtTime(B.cut, t + dur);
      osc('sine', hz(m - 12), 0, false, 0.9);
    } else if (B.logdrum) {
      const o = osc('sine', hz(m), 0, false, 1);
      o.frequency.setValueAtTime(hz(m) * 1.6, t); o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.05);
      osc('square', hz(m));
    } else {
      osc(B.wave, hz(m));
      if (B.sub || B.wave !== 'sine') osc('sine', hz(m), 0, false, 0.5);
    }
    const len = Math.max(0.06, dur - 0.01);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(B.v, t + 0.006);
    g.gain.setValueAtTime(B.v * (B.logdrum ? 0.4 : 0.85), t + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    oscs.forEach((o) => { o.start(t); o.stop(t + len + 0.05); });
    f.connect(g).connect(music);
  };

  const chordHit = (t, ms, dur, C) => {
    const bus = ctx.createGain(); bus.connect(music);
    if (C.delay) { const dg = ctx.createGain(); dg.gain.value = 0.6; bus.connect(dg).connect(delIn); }
    const sendG = ctx.createGain(); sendG.gain.value = C.type === 'pad' || C.type === 'strings' ? 0.8 : 0.35; bus.connect(sendG).connect(revIn);
    const type = C.type;
    if (type === 'rhodes') {
      ms.forEach((m) => {
        const f = hz(m);
        const c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
        c.frequency.value = f; mo.frequency.value = f; mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.6);
        mo.connect(mg).connect(c.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(C.v, t + 0.006);
        g.gain.exponentialRampToValueAtTime(C.v * 0.35, t + 0.9); g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
        c.connect(g).connect(bus); [c, mo].forEach((o) => { o.start(t); o.stop(t + dur + 0.8); });
      });
      return;
    }
    // one shared filter + envelope per chord
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    const g = ctx.createGain();
    let waves = ['sawtooth'], det = [0], stop = dur + 0.4;
    if (type === 'pad' || type === 'strings') {
      lp.frequency.value = type === 'pad' ? 1100 : 3200; lp.Q.value = 0.5;
      const a = type === 'pad' ? Math.min(1.2, dur * 0.3) : 0.25;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(C.v, t + a);
      g.gain.setValueAtTime(C.v, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
      det = [-9, 9]; stop = dur + 0.7;
    } else if (type === 'supersaw') {
      lp.frequency.value = 4200;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(C.v, t + 0.02);
      g.gain.setValueAtTime(C.v, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
      det = [-20, -7, 7, 20]; stop = dur + 0.35;
    } else { // stab / piano
      lp.frequency.setValueAtTime(type === 'piano' ? 5000 : 2600, t); lp.frequency.exponentialRampToValueAtTime(type === 'piano' ? 900 : 500, t + 0.25);
      env(g, t, 0.003, C.v, Math.max(0.12, dur * 0.9));
      waves = type === 'piano' ? ['triangle', 'square'] : ['sawtooth', 'square'];
      det = [-6, 6];
    }
    ms.forEach((m) => {
      const f = hz(m);
      det.forEach((d, i) => {
        const o = ctx.createOscillator(); o.type = waves[i % waves.length];
        o.frequency.value = f * (type === 'piano' && i ? 2 : 1); o.detune.value = d;
        o.connect(lp); o.start(t); o.stop(t + stop);
      });
    });
    lp.connect(g).connect(bus);
  };

  const leadNote = (t, m, dur, type, v) => {
    if (type === 'rhodes') return chordHit(t, [m], dur, { type: 'rhodes', v });
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    const o = ctx.createOscillator(); o.frequency.value = hz(m);
    if (type === 'bell') { o.type = 'sine'; const o2 = ctx.createOscillator(); o2.frequency.value = hz(m) * 3.01; const g2 = ctx.createGain(); env(g2, t, 0.002, v * 0.3, 0.4); o2.connect(g2).connect(g); o2.start(t); o2.stop(t + 1); lp.frequency.value = 6000; }
    else if (type === 'marimba') { o.type = 'sine'; lp.frequency.value = 3000; const o2 = ctx.createOscillator(); o2.frequency.value = hz(m) * 4; const g2 = ctx.createGain(); env(g2, t, 0.001, v * 0.25, 0.05); o2.connect(g2).connect(g); o2.start(t); o2.stop(t + 0.2); }
    else if (type === 'saw') { o.type = 'sawtooth'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.2); }
    else { o.type = 'triangle'; lp.frequency.setValueAtTime(4500, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.18); }
    env(g, t, 0.003, v, type === 'marimba' ? 0.35 : Math.max(0.15, dur));
    o.connect(lp).connect(g).connect(music);
    const dg = ctx.createGain(); dg.gain.value = 0.5; g.connect(dg).connect(delIn);
    o.start(t); o.stop(t + dur + 0.6);
  };

  const acidNote = (t, m, dur, accent, v) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 14;
    lp.frequency.setValueAtTime(accent ? 2600 : 1200, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.14);
    const g = ctx.createGain(); env(g, t, 0.003, v * (accent ? 1.3 : 0.9), dur * 0.9);
    o.connect(lp).connect(g).connect(music);
    const dg = ctx.createGain(); dg.gain.value = 0.35; g.connect(dg).connect(delIn);
    o.start(t); o.stop(t + dur + 0.1);
  };

  for (const e of events) {
    const t = Math.max(0, e.t - t0);
    if (e.y === 'bass') bassNote(t, e.m, e.dur, e.B);
    else if (e.y === 'chord') chordHit(t, e.ms, e.dur, e.C);
    else if (e.y === 'lead') leadNote(t, e.m, e.dur, e.type, e.v);
    else if (e.y === 'acid') acidNote(t, e.m, e.dur, e.acc, e.v);
  }
  return ctx.startRendering();
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

function impulse(ctx, secs, decay) {
  const len = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

function addCrackle(d, amt) {
  let lp = 0;
  for (let i = 0; i < d.length; i++) {
    lp = lp * 0.9 + (Math.random() * 2 - 1) * 0.1;
    d[i] += lp * amt * 0.5;
    if (Math.random() < 0.00016) { const a = (Math.random() * 0.6 + 0.2) * amt * 4; for (let k = 0; k < 30 && i + k < d.length; k++) d[i + k] += a * Math.exp(-k / 5) * (k % 2 ? -1 : 1); }
  }
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

  setBuffer(buf) {
    this.killSource();
    this.buffer = buf; this.rev = null; this.pos = 0; this.played = 0;
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
    const p = ((this.pos % L) + L) % L;
    const s = this.ctx.createBufferSource();
    s.buffer = dir > 0 ? this.buffer : this.reverseBuffer();
    s.loop = true;
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

    if (this.ctx && this.buffer && this.needle) {
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
