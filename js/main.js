import { RECORDS } from './records.js';
import { Shelf } from './shelf.js';
import { DeckUI } from './deck.js';
import { loadAudio } from './audio.js';
import { loadChart, sampleColors, GENRES } from './chart.js';
import { coverSVG } from './covers.js';
import { initBooking } from './booking.js';
import { CONFIG } from './config.js';
import { REVIEWS, VENUES } from './reviews.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('.yr').forEach((e) => (e.textContent = new Date().getFullYear()));

// ------------------------------------------------------------ reviews + venues
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderReviews() {
  const track = $('reviewTrack');
  const stars = (n) => `<span class="rv-stars" aria-label="${n} out of 5 stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
  const card = (r, dup) => `<li class="rv${r.placeholder ? ' placeholder' : ''}"${dup ? ' aria-hidden="true"' : ''}>
      ${r.placeholder ? '<span class="rv-tag mono">Placeholder · edit js/reviews.js</span>' : ''}
      ${r.rating ? stars(Math.max(1, Math.min(5, Math.round(r.rating)))) : ''}
      <blockquote>“${esc(r.quote)}”</blockquote>
      <p class="rv-by"><b>${esc(r.name)}</b><span class="mono">${esc(r.event)}${r.where ? ` · ${esc(r.where)}` : ''}</span></p>
    </li>`;
  // the list runs twice so the scroll loops seamlessly
  track.innerHTML = REVIEWS.map((r) => card(r, false)).join('') + REVIEWS.map((r) => card(r, true)).join('');
  track.style.setProperty('--dur', `${Math.max(30, REVIEWS.length * 11)}s`);
  $('venueList').innerHTML = VENUES.map((v) => `<li class="${v.placeholder ? 'placeholder' : ''}"><b>${esc(v.name)}</b>${v.city ? `<span class="mono">${esc(v.city)}</span>` : ''}</li>`).join('');
}
renderReviews();

// ------------------------------------------------------------ crate meta + ruler
// The ruler under the shelf: tempo for the generated sets, chart position for songs.
const meta = document.querySelector('.crate-meta');
let records = RECORDS, axis;

function makeAxis(list) {
  if (list[0]?.kind === 'song') {
    const n = list.length;
    return {
      min: 0.5, max: n + 0.5, value: (r) => r.rank, label: 'Browse the chart',
      text: (r) => `No. ${r.rank}, ${r.title} by ${r.artist}`,
      ticks: () => false,
      marks: [1, ...Array.from({ length: Math.floor(n / 10) }, (_, i) => (i + 1) * 10)].filter((v) => v <= n),
      fmt: (v) => (v === 1 ? '#1' : v),
    };
  }
  return {
    min: 78, max: 182, value: (r) => r.bpm, label: 'Browse by tempo (BPM)',
    text: (r) => `${r.bpm} BPM, ${r.title}`,
    ticks: (v) => list.some((r) => Math.abs(r.bpm - v) < 0.35),
    marks: [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180],
    fmt: (v) => v,
  };
}
const pct = (v) => ((v - axis.min) / (axis.max - axis.min)) * 100;

function buildRuler() {
  const ticks = $('rulerTicks'), labels = $('rulerLabels');
  const n = Math.max(60, Math.min(180, Math.floor(window.innerWidth / 8)));
  let html = '';
  for (let i = 0; i <= n; i++) {
    const v = axis.min + (i / n) * (axis.max - axis.min);
    const near = axis.ticks(v);
    const h = near ? 100 : 18 + Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)) * 52 + (i % 5 === 0 ? 10 : 0);
    html += `<i data-v="${v.toFixed(2)}" class="${near ? 'rec' : ''}" style="height:${h.toFixed(0)}%"></i>`;
  }
  ticks.innerHTML = html;
  labels.innerHTML = axis.marks.map((m) => `<span data-b="${m}" style="left:${pct(m)}%">${axis.fmt(m)}</span>`).join('');
  $('ruler').setAttribute('aria-label', axis.label);
  $('ruler').setAttribute('aria-valuemin', axis.min); $('ruler').setAttribute('aria-valuemax', axis.max);
}

function updateMeta(r) {
  meta.classList.remove('swap'); void meta.offsetWidth; meta.classList.add('swap');
  const song = r.kind === 'song';
  $('metaCat').textContent = r.cat;
  $('metaGenre').textContent = r.genre;
  $('metaTitle').textContent = r.title;
  $('metaSub').textContent = song
    ? `${r.artist}${r.year ? `, ${r.year}` : ''}`
    : `${r.bpm} BPM · ${r.flow[0].split(' — ')[0]} → ${r.flow[r.flow.length - 1].split(' — ')[0]}`;
  meta.style.setProperty('--rec-ac', r.pal.fg);
  const v = axis.value(r);
  $('rulerMarker').style.left = `${pct(v)}%`;
  $('ruler').setAttribute('aria-valuenow', v);
  $('ruler').setAttribute('aria-valuetext', axis.text(r));
  $('rulerTicks').querySelectorAll('i').forEach((t) => t.classList.toggle('past', +t.dataset.v <= v));
  const near = (axis.max - axis.min) / 20;
  $('rulerLabels').querySelectorAll('span').forEach((s) => s.classList.toggle('on', Math.abs(+s.dataset.b - v) < near));
}

// ------------------------------------------------------------ deck
let shelf;
const deckUI = new DeckUI({
  records: RECORDS,
  onState: ({ rec, playing }) => {
    $('platterNow').textContent = rec ? `${rec.cat} ${rec.title}` : 'Needle up';
    $('platterDot').classList.toggle('live', playing);
    $('npDot').classList.toggle('live', playing);
    document.body.classList.toggle('playing', playing);
    if (rec) document.body.style.setProperty('--beat', `${60 / (deckUI.bpm || rec.bpm || 120)}s`);
    document.querySelector('.decks').style.setProperty('--glow', playing ? 1 : 0.5);
    shelf?.markOnDeck(rec);
  },
});

async function spin(r) {
  deckUI.prime(); // unlock audio inside the click
  shelf.pull(true);
  loadAudio(r).catch(() => {});
  await wait(reduced ? 0 : 1250); // let the disc slide all the way out before moving on
  const tt = $('booth').getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + tt.top - Math.max(70, (window.innerHeight - tt.height) / 2), behavior: reduced ? 'auto' : 'smooth' });
  await wait(reduced ? 0 : 900);
  shelf.pull(false);
  deckUI.load(r, { autoplay: true });
}

/** show a chart's details around the crate */
function showChart(chart, genreName) {
  const when = chart.updated ? new Date(chart.updated) : null;
  $('crateSource').textContent = `${chart.title}${when && !isNaN(when) ? ` · ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`;
  $('crateCredit').hidden = false;
  $('crateKicker').textContent = genreName && genreName !== 'All'
    ? `Top ${chart.songs.length} in ${genreName}, ready on the decks`
    : `This week’s top ${chart.songs.length}, ready on the decks`;
}

let colorRun = 0;
function colorSpines(list) {
  const run = ++colorRun;
  sampleColors(list, (r) => {
    if (run !== colorRun) return;
    shelf.recolor(r);
    if (r === shelf.record) meta.style.setProperty('--rec-ac', r.pal.fg);
  });
}

/** genre buttons above the crate */
function buildGenreBar(current) {
  const bar = $('genreBar');
  bar.hidden = false;
  bar.innerHTML = GENRES.map((g) => `<button type="button" role="tab" data-genre="${g.id}" aria-selected="${g.id === current}">${g.name}</button>`).join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-genre]');
    if (b && b.getAttribute('aria-selected') !== 'true') switchGenre(b.dataset.genre);
  });
  // centre the chosen genre inside the row, without scrolling the page
  const sel = bar.querySelector('[aria-selected="true"]');
  if (sel) bar.scrollLeft = sel.offsetLeft - (bar.clientWidth - sel.offsetWidth) / 2;
}

let genreReq = 0;
async function switchGenre(id) {
  const g = GENRES.find((x) => x.id === id) || GENRES[0];
  const req = ++genreReq;
  $('genreBar').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.genre === g.id));
  try { localStorage.setItem('nolza-genre', g.id); } catch (e) {}
  const crate = document.querySelector('.crate');
  crate.classList.remove('ready');
  crate.classList.add('loading');
  const [chart] = await Promise.all([
    loadChart({ country: CONFIG.chart?.country || 'us', genre: g.id }).catch(() => null),
    wait(reduced ? 0 : 450), // let the shelf fade out first
  ]);
  if (req !== genreReq) return;
  crate.classList.remove('loading');
  if (!chart) { crate.classList.add('ready'); $('crateKicker').textContent = `Couldn’t load the ${g.name} chart — try again`; return; }
  records = chart.songs;
  axis = makeAxis(records);
  buildRuler();
  shelf.setRecords(records, 0);
  deckUI.setRecords(records);
  showChart(chart, g.name);
  crate.classList.add('ready');
  colorSpines(records);
}

async function initCrate() {
  // The live chart when it's reachable, otherwise the generated sets.
  let chart = null, genre = CONFIG.chart?.genre || '';
  try { genre = localStorage.getItem('nolza-genre') ?? genre; } catch (e) {}
  if (!GENRES.some((g) => g.id === genre)) genre = '';
  if (CONFIG.chart?.enabled !== false) {
    const country = CONFIG.chart?.country || 'us';
    try { chart = await loadChart({ country, genre }); } catch (e) {
      try { if (genre) chart = await loadChart({ country }); genre = ''; } catch (e2) { console.info('Chart unavailable, using the generated sets.', e2); }
    }
  }
  if (chart) {
    records = chart.songs;
    deckUI.setRecords(records);
    showChart(chart, GENRES.find((g) => g.id === genre)?.name);
    buildGenreBar(genre);
  }
  axis = makeAxis(records);
  buildRuler();

  let prefetchT;
  shelf = new Shelf({
    records, start: chart ? 0 : records.length * 4 + 4,
    stage: $('shelfStage'), ring: $('shelfRing'), ledge: $('shelfLedge'), wrap: $('shelfWrap'), tip: $('spineTip'),
    onChange: (r) => {
      updateMeta(r);
      clearTimeout(prefetchT);
      prefetchT = setTimeout(() => (window.requestIdleCallback || setTimeout)(() => loadAudio(r).catch(() => {})), 1100);
    },
    onSpin: (r) => spin(r),
  });
  updateMeta(shelf.record);
  document.querySelector('.crate').classList.add('ready');
  if (chart) colorSpines(records);

  $('prevRec').addEventListener('click', () => shelf.go(-1));
  $('nextRec').addEventListener('click', () => shelf.go(1));
  $('spinBtn').addEventListener('click', () => spin(shelf.record));

  // ruler: click / drag to the nearest record
  const ruler = $('ruler');
  const pickAt = (x) => {
    const b = ruler.getBoundingClientRect();
    const v = axis.min + ((x - b.left) / b.width) * (axis.max - axis.min);
    let best = records[0];
    records.forEach((r) => { if (Math.abs(axis.value(r) - v) < Math.abs(axis.value(best) - v)) best = r; });
    if (best !== shelf.record) shelf.goToRecord(best.index);
  };
  let rulerDown = false;
  ruler.addEventListener('pointerdown', (e) => { rulerDown = true; ruler.setPointerCapture(e.pointerId); pickAt(e.clientX); });
  ruler.addEventListener('pointermove', (e) => rulerDown && pickAt(e.clientX));
  ruler.addEventListener('pointerup', () => (rulerDown = false));
  ruler.addEventListener('keydown', (e) => {
    const n = records.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); shelf.goToRecord((shelf.record.index + 1) % n); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); shelf.goToRecord((shelf.record.index - 1 + n) % n); }
  });
  window.addEventListener('resize', () => { buildRuler(); updateMeta(shelf.record); });
}

// keyboard browsing while the crate is on screen
let crateVisible = true;
new IntersectionObserver(([e]) => (crateVisible = e.intersectionRatio > 0.4), { threshold: [0, 0.4, 1] }).observe($('crate'));
window.addEventListener('keydown', (e) => {
  if (!shelf || !crateVisible || e.target.closest('input, textarea, select, .ruler')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); shelf.go(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); shelf.go(-1); }
  else if (e.key === 'Enter' && (e.target === document.body || e.target.closest('.case'))) { e.preventDefault(); spin(shelf.record); }
});

// ------------------------------------------------------------ formats: sleeves
document.querySelectorAll('.format-sleeve').forEach((s) => {
  const r = RECORDS.find((x) => x.cat === s.dataset.cover);
  s.insertAdjacentHTML('beforeend', coverSVG(r));
  s.style.setProperty('--lbl', r.pal.fg);
});

// ------------------------------------------------------------ header + reveals
const topbar = document.querySelector('.topbar');
const darkSections = [...document.querySelectorAll('.reviews, .decks, .book, .footer')];
const onScroll = () => {
  topbar.classList.toggle('scrolled', window.scrollY > 20);
  const y = topbar.offsetHeight / 2;
  topbar.classList.toggle('on-dark', darkSections.some((s) => { const b = s.getBoundingClientRect(); return b.top <= y && b.bottom >= y; }));
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const io = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// About: roll the record out once the sleeve is properly on screen
const sleeveIO = new IntersectionObserver(([e]) => {
  if (e.intersectionRatio >= 0.6) { e.target.classList.add('in'); sleeveIO.disconnect(); }
}, { threshold: [0, 0.6] });
sleeveIO.observe(document.querySelector('.portrait-sleeve'));
new IntersectionObserver(([e]) => document.querySelector('.book').classList.toggle('in', e.isIntersecting)).observe(document.querySelector('.book'));

initBooking(RECORDS);
initCrate();
