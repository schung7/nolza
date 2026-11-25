// Live chart: Apple's iTunes Top Songs feed, turned into crate records.
// Each song keeps its Apple links; previews are streamed by the turntable and
// only held in memory (see js/audio.js). If the chart can't load, the site
// falls back to the generated sets in js/records.js.

const FEED = (country, limit, genre) => `https://itunes.apple.com/${country}/rss/topsongs/limit=${limit}${genre ? `/genre=${genre}` : ''}/json`;
const META_KEY = 'nolza-chart-v2';

/** genre charts offered above the crate (Apple genre ids) */
export const GENRES = [
  { id: '', name: 'All' },
  { id: '14', name: 'Pop' },
  { id: '18', name: 'Hip-Hop' },
  { id: '15', name: 'R&B' },
  { id: '17', name: 'Dance' },
  { id: '7', name: 'Electronic' },
  { id: '6', name: 'Country' },
  { id: '12', name: 'Latin' },
  { id: '51', name: 'K-Pop' },
  { id: '21', name: 'Rock' },
  { id: '20', name: 'Alternative' },
  { id: '24', name: 'Reggae' },
  { id: '11', name: 'Jazz' },
];
const META_TTL = 60 * 60 * 1000; // re-fetch the list at most hourly

export async function loadChart({ country = 'us', genre = '', limit = 100, timeout = 6000 } = {}) {
  const cached = readCache(country, genre);
  if (cached) return cached;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(FEED(country, limit, genre), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`chart ${res.status}`);
    const feed = (await res.json()).feed;
    const songs = (feed.entry || []).map(toRecord).filter((s) => s.previewUrl);
    if (!songs.length) throw new Error('empty chart');
    songs.forEach((s, i) => { s.index = i; });
    const chart = { songs, updated: feed.updated?.label, title: feed.title?.label || 'iTunes Top Songs', country, genre };
    writeCache(chart);
    return chart;
  } finally {
    clearTimeout(timer);
  }
}

function toRecord(e, i) {
  const attr = (x) => x?.attributes || {};
  const links = [].concat(e.link || []);
  const preview = links.find((l) => (attr(l).type || '').startsWith('audio'));
  const store = links.find((l) => attr(l).rel === 'alternate');
  const imgs = [].concat(e['im:image'] || []);
  const img = imgs[imgs.length - 1]?.label || '';
  const id = attr(e.id)['im:id'] || String(i);
  const rank = i + 1;
  return {
    kind: 'song',
    id: `it-${id}`,
    rank,
    cat: `#${String(rank).padStart(2, '0')}`,
    title: e['im:name']?.label || 'Untitled',
    artist: e['im:artist']?.label || '',
    album: e['im:collection']?.['im:name']?.label || '',
    genre: attr(e.category).label || attr(e.category).term || 'Music',
    year: (e['im:releaseDate']?.label || '').slice(0, 4),
    art: artUrl(img, 300),
    artSmall: artUrl(img, 60),
    previewUrl: attr(preview).href,
    url: store ? attr(store).href : e.id?.label,
    pal: palette(id),
  };
}

/** mzstatic artwork URLs end in e.g. /170x170bb.png; ask for the size we want */
function artUrl(u, size) {
  return u.replace(/\/\d+x\d+bb(-\d+)?\.(png|jpg|jpeg|webp)$/i, `/${size}x${size}bb.jpg`);
}

/** placeholder spine colours until the artwork colour is sampled */
function palette(seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return { bg: `hsl(${h} 45% 42%)`, fg: `hsl(${(h + 30) % 360} 70% 62%)`, ac: '#e5502f', tx: '#ffffff', vinyl: '#141414' };
}

/**
 * Sample each cover's dominant colour so spines match their artwork.
 * Calls onColor(record) as each one resolves.
 */
export function sampleColors(songs, onColor) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  let i = 0;
  const next = () => {
    if (i >= songs.length) return;
    const s = songs[i++];
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        g.drawImage(img, 0, 0, 16, 16);
        const d = g.getImageData(0, 0, 16, 16).data;
        // weight saturated, mid-bright pixels: those make good spine colours
        let r = 0, gg = 0, b = 0, w = 0;
        for (let k = 0; k < d.length; k += 4) {
          const R = d[k], G = d[k + 1], B = d[k + 2];
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B), sat = mx ? (mx - mn) / mx : 0, lum = (R * 0.3 + G * 0.59 + B * 0.11) / 255;
          const wt = 0.15 + sat * (1 - Math.abs(lum - 0.5));
          r += R * wt; gg += G * wt; b += B * wt; w += wt;
        }
        r /= w; gg /= w; b /= w;
        const lum = (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
        s.pal = { ...s.pal, bg: `rgb(${r | 0} ${gg | 0} ${b | 0})`, tx: lum > 0.6 ? '#151515' : '#ffffff', fg: lum > 0.6 ? '#151515' : `rgb(${Math.min(255, r * 1.4) | 0} ${Math.min(255, gg * 1.4) | 0} ${Math.min(255, b * 1.4) | 0})` };
        onColor(s);
      } catch (e) { /* tainted canvas: keep the placeholder colour */ }
      setTimeout(next, 0);
    };
    img.onerror = () => setTimeout(next, 0);
    img.src = s.artSmall;
  };
  for (let k = 0; k < 4; k++) next();
}

const cacheKey = (country, genre) => `${META_KEY}:${country}:${genre || 'all'}`;
function readCache(country, genre) {
  try {
    const c = JSON.parse(sessionStorage.getItem(cacheKey(country, genre)));
    if (c && Date.now() - c.at < META_TTL) return c.chart;
  } catch (e) {}
  return null;
}
function writeCache(chart) {
  try { sessionStorage.setItem(cacheKey(chart.country, chart.genre), JSON.stringify({ at: Date.now(), chart })); } catch (e) {}
}
