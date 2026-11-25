// Generated sleeve art. Every cover is an inline SVG built from the record's
// palette + motif, so there are no image files to manage.

let uid = 0;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function rng(seed) {
  let a = 0;
  for (const c of String(seed)) a = (a * 31 + c.charCodeAt(0)) | 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOTIFS = {
  waves(r, p, id) {
    let s = '';
    for (let i = 0; i < 9; i++) {
      const y = 250 + i * 42;
      const amp = 14 + (i % 3) * 6;
      const ph = i * 37;
      let d = `M -20 ${y}`;
      for (let x = -20; x <= 640; x += 20) d += ` L ${x} ${(y + Math.sin((x + ph) / 46) * amp).toFixed(1)}`;
      d += ' L 640 640 L -20 640 Z';
      s += `<path d="${d}" fill="${i % 2 ? p.fg : p.bg}" opacity="${i % 2 ? 0.9 - i * 0.04 : 1}"/>`;
    }
    return `<circle cx="430" cy="210" r="70" fill="${p.ac}"/>` + s;
  },
  blocks(r, p, id) {
    const R = rng(r.cat); let s = '';
    const cell = 150, cols = [p.fg, p.ac, p.bg, p.fg];
    for (let y = 1; y < 4; y++) for (let x = 0; x < 4; x++) {
      const X = x * cell, Y = y * cell, c = cols[Math.floor(R() * 4)], k = Math.floor(R() * 4);
      if (c === p.bg) continue;
      if (k === 0) s += `<rect x="${X}" y="${Y}" width="${cell}" height="${cell}" fill="${c}"/>`;
      else if (k === 1) s += `<circle cx="${X + 75}" cy="${Y + 75}" r="70" fill="${c}"/>`;
      else { const cx = X + (k === 2 ? 0 : cell), cy = Y + cell;
        s += `<path d="M ${cx} ${cy} L ${cx} ${cy - cell} A ${cell} ${cell} 0 0 ${k === 2 ? 1 : 0} ${cx + (k === 2 ? cell : -cell)} ${cy} Z" fill="${c}"/>`; }
    }
    return s;
  },
  rings(r, p, id) {
    let s = '';
    for (let i = 14; i > 0; i--) s += `<circle cx="390" cy="360" r="${i * 22}" fill="none" stroke="${i % 2 ? p.fg : p.ac}" stroke-width="${i % 3 === 0 ? 7 : 2.5}" opacity="${0.35 + i * 0.04}"/>`;
    return s + `<circle cx="390" cy="360" r="34" fill="${p.ac}"/>`;
  },
  mirrorball(r, p, id) {
    const R = rng(r.cat); let s = '';
    const cx = 300, cy = 330, rad = 190;
    for (let y = cy - rad; y < cy + rad; y += 24) for (let x = cx - rad; x < cx + rad; x += 24) {
      const t = R(); const c = t > 0.85 ? p.ac : t > 0.35 ? p.fg : p.bg;
      s += `<rect x="${x + 1}" y="${y + 1}" width="22" height="22" fill="${c}" opacity="${0.55 + R() * 0.45}"/>`;
    }
    const star = (x, y, k) => `<path d="M ${x} ${y - k} Q ${x} ${y} ${x + k} ${y} Q ${x} ${y} ${x} ${y + k} Q ${x} ${y} ${x - k} ${y} Q ${x} ${y} ${x} ${y - k} Z" fill="${p.fg}"/>`;
    return `<line x1="300" y1="0" x2="300" y2="140" stroke="${p.fg}" stroke-width="3"/>
      <clipPath id="${id}c"><circle cx="${cx}" cy="${cy}" r="${rad}"/></clipPath>
      <g clip-path="url(#${id}c)">${s}<circle cx="${cx - 60}" cy="${cy - 70}" r="120" fill="#fff" opacity=".18"/></g>
      ${star(110, 470, 34)}${star(500, 200, 26)}${star(480, 520, 18)}`;
  },
  sun(r, p, id) {
    let s = `<clipPath id="${id}h"><rect x="0" y="0" width="600" height="360"/></clipPath>
      <circle cx="300" cy="360" r="190" fill="${p.fg}" clip-path="url(#${id}h)"/>`;
    for (let i = 0; i < 8; i++) {
      const y = 372 + i * (12 + i * 2.6), h = 4 + i * 2.2;
      s += `<rect x="0" y="${y}" width="600" height="${h}" fill="${i % 2 ? p.ac : p.fg}" opacity="${1 - i * 0.07}"/>`;
    }
    return s;
  },
  kente(r, p, id) {
    const R = rng(r.cat); let s = '';
    const cols = [p.fg, p.ac, p.tx, p.bg];
    for (let y = 150; y < 600; y += 50) {
      let x = 0;
      while (x < 600) {
        const w = 30 + Math.floor(R() * 4) * 30, c = cols[Math.floor(R() * cols.length)];
        s += `<rect x="${x}" y="${y}" width="${w}" height="46" fill="${c}"/>`;
        if (R() > 0.6) s += `<rect x="${x + 8}" y="${y + 18}" width="${w - 16}" height="10" fill="${cols[(cols.indexOf(c) + 1) % 4]}"/>`;
        x += w + 4;
      }
    }
    return s;
  },
  grid(r, p, id) {
    const R = rng(r.cat); let s = '';
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const hot = R() > 0.9;
      s += `<circle cx="${60 + x * 54}" cy="${150 + y * 46}" r="${hot ? 13 : 4}" fill="${hot ? p.ac : p.fg}" opacity="${hot ? 1 : 0.4 + (y / 10) * 0.6}"/>`;
    }
    return s;
  },
  halftone(r, p, id) {
    let s = '';
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      const X = 20 + x * 40 + (y % 2) * 20, Y = 140 + y * 32;
      const d = Math.hypot(X - 330, Y - 380) / 300;
      const rad = Math.max(0, 17 * (1 - d));
      if (rad > 0.6) s += `<circle cx="${X}" cy="${Y}" r="${rad.toFixed(1)}" fill="${p.fg}"/>`;
    }
    // a flower bloom
    let petals = '';
    for (let i = 0; i < 8; i++) petals += `<ellipse cx="330" cy="310" rx="26" ry="70" fill="${p.ac}" transform="rotate(${i * 45} 330 380)"/>`;
    return s + petals + `<circle cx="330" cy="380" r="30" fill="${p.fg}"/>`;
  },
  type(r, p, id) {
    let s = '';
    const words = ['NIGHT', 'MARKET', 'NIGHT', 'MARKET'];
    words.forEach((w, i) => {
      const filled = i % 2 === 0;
      s += `<text x="${-10 + (i % 2) * 40}" y="${250 + i * 108}" font-family="Inter Tight, Inter, system-ui, sans-serif" font-weight="800" font-size="124" letter-spacing="-4"
        fill="${filled ? p.fg : 'none'}" stroke="${p.fg}" stroke-width="${filled ? 0 : 2.5}">${w}</text>`;
    });
    return s + `<circle cx="500" cy="170" r="38" fill="${p.ac}"/>`;
  },
  eq(r, p, id) {
    const R = rng(r.cat); let s = '';
    for (let i = 0; i < 14; i++) {
      const h = 60 + Math.floor(R() * 7) * 40, x = 22 + i * 41;
      for (let y = 570; y > 570 - h; y -= 20) s += `<rect x="${x}" y="${y - 16}" width="33" height="16" fill="${y < 570 - h + 50 ? p.ac : p.fg}"/>`;
    }
    return s;
  },
  tunnel(r, p, id) {
    let s = '';
    for (let i = 0; i < 16; i++) {
      const k = 520 - i * 31;
      s += `<rect x="${300 - k / 2}" y="${370 - k / 2}" width="${k}" height="${k}" fill="none" stroke="${i === 9 ? p.ac : p.fg}" stroke-width="${i === 9 ? 10 : 2.5}" transform="rotate(${i * 4} 300 370)"/>`;
    }
    return s;
  },
  spiral(r, p, id) {
    let d = 'M 300 360';
    for (let t = 0; t < 34; t += 0.12) {
      const rad = 6 + t * 6.4;
      d += ` L ${(300 + Math.cos(t) * rad).toFixed(1)} ${(360 + Math.sin(t) * rad).toFixed(1)}`;
    }
    let lines = '';
    for (let i = 0; i < 7; i++) lines += `<rect x="${380 + i * 12}" y="${140 + i * 64}" width="${220 - i * 12}" height="6" fill="${p.ac}" opacity=".7"/>`;
    return `<path d="${d}" fill="none" stroke="${p.fg}" stroke-width="9" stroke-linecap="round"/>` + lines;
  },
};

/** Front cover, square. */
export function coverSVG(r, opts = {}) {
  const id = `cv${++uid}`;
  const p = r.pal;
  const art = (MOTIFS[r.motif] || MOTIFS.rings)(r, p, id);
  const titleLines = splitTitle(r.title);
  const sans = 'Inter Tight, Inter, system-ui, sans-serif';
  const mono = 'JetBrains Mono, ui-monospace, monospace';
  return `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" class="cover-svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <rect width="600" height="600" fill="${p.bg}"/>
    <g>${art}</g>
    <rect width="600" height="600" fill="url(#${id}g)" opacity=".5"/>
    <defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/>
    </linearGradient></defs>
    <text x="36" y="58" font-family="${sans}" font-size="22" font-weight="500" fill="${p.tx}">Nolza</text>
    ${titleLines.map((l, i) => `<text x="34" y="${100 + i * 40}" font-family="${sans}" font-size="38" font-weight="700" letter-spacing="-1" fill="${p.tx}">${esc(l)}</text>`).join('')}
    <text x="564" y="56" text-anchor="end" font-family="${mono}" font-size="16" letter-spacing="2" fill="${p.tx}" opacity=".8">${r.cat}</text>
    <circle cx="44" cy="560" r="9" fill="${p.tx}"/><circle cx="44" cy="560" r="3" fill="${p.bg}"/>
    <text x="62" y="566" font-family="${mono}" font-size="15" letter-spacing="2" fill="${p.tx}" opacity=".85">NOLZA SOUND</text>
    <text x="564" y="566" text-anchor="end" font-family="${mono}" font-size="15" letter-spacing="2" fill="${p.tx}" opacity=".85">${r.bpm} BPM</text>
  </svg>`;
}

/** Back cover: tracklist + barcode. */
export function backSVG(r) {
  const p = r.pal;
  const mono = 'JetBrains Mono, ui-monospace, monospace';
  const sans = 'Inter Tight, Inter, system-ui, sans-serif';
  const R = rng(r.cat + 'bc');
  let bars = '';
  for (let x = 0; x < 120;) { const w = 1 + Math.floor(R() * 4); if (R() > 0.35) bars += `<rect x="${440 + x}" y="470" width="${w}" height="70" fill="#141414"/>`; x += w + 1; }
  return `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" class="cover-svg" aria-hidden="true">
    <rect width="600" height="600" fill="${p.bg}"/>
    <rect width="600" height="600" fill="${p.fg}" opacity=".12"/>
    <text x="40" y="70" font-family="${sans}" font-size="30" font-weight="700" fill="${p.tx}">${esc(r.title)}</text>
    ${r.flow.map((f, i) => `<text x="40" y="${140 + i * 44}" font-family="${mono}" font-size="17" fill="${p.tx}" opacity=".85">${String.fromCharCode(65 + i)}${i + 1}  ${esc(f)}</text>`).join('')}
    <rect x="430" y="460" width="140" height="100" fill="#fff"/>${bars}
    <text x="40" y="550" font-family="${mono}" font-size="14" letter-spacing="2" fill="${p.tx}" opacity=".7">${r.cat} · ${esc(r.genre.toUpperCase())}</text>
  </svg>`;
}

/** Centre label for the vinyl, with text running around the edge. */
export function labelSVG(r) {
  const id = `lb${++uid}`;
  const p = r.pal;
  const mono = 'JetBrains Mono, ui-monospace, monospace';
  const art = (MOTIFS[r.motif] || MOTIFS.rings)(r, p, id);
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <clipPath id="${id}cl"><circle cx="100" cy="100" r="100"/></clipPath>
      <path id="${id}t" d="M 100 100 m -82 0 a 82 82 0 1 1 164 0 a 82 82 0 1 1 -164 0"/>
    </defs>
    <g clip-path="url(#${id}cl)">
      <rect width="200" height="200" fill="${p.bg}"/>
      <g transform="translate(0 -10) scale(.3333)">${art}</g>
      <circle cx="100" cy="100" r="100" fill="url(#${id}rg)"/>
    </g>
    <radialGradient id="${id}rg"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>
    <text font-family="${mono}" font-size="9" letter-spacing="2.4" fill="${p.tx}"><textPath href="#${id}t">NOLZA SOUND · ${r.cat} · ${esc(r.title.toUpperCase())} · SIDE A · 33⅓ RPM ·</textPath></text>
    <circle cx="100" cy="100" r="5" fill="#0b0b0b"/>
  </svg>`;
}

function splitTitle(t) {
  const words = t.split(' ');
  if (t.length <= 14 || words.length === 1) return [t];
  let best = 1, diff = 1e9;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length, b = words.slice(i).join(' ').length;
    if (Math.abs(a - b) < diff) { diff = Math.abs(a - b); best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
