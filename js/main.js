import { RECORDS } from './records.js';
import { Shelf } from './shelf.js';
import { DeckUI } from './deck.js';
import { renderRecord } from './audio.js';
import { coverSVG } from './covers.js';
import { initBooking } from './booking.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('.yr').forEach((e) => (e.textContent = new Date().getFullYear()));

// ------------------------------------------------------------ crate meta + ruler
const BPM_MIN = 78, BPM_MAX = 182;
const pct = (bpm) => ((bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100;
const meta = document.querySelector('.crate-meta');

function buildRuler() {
  const ticks = $('rulerTicks'), labels = $('rulerLabels');
  const n = Math.max(60, Math.min(180, Math.floor(window.innerWidth / 8)));
  let html = '';
  for (let i = 0; i <= n; i++) {
    const bpm = BPM_MIN + (i / n) * (BPM_MAX - BPM_MIN);
    const near = RECORDS.some((r) => Math.abs(r.bpm - bpm) < (BPM_MAX - BPM_MIN) / n / 2);
    const h = near ? 100 : 18 + Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)) * 52 + (i % 5 === 0 ? 10 : 0);
    html += `<i data-bpm="${bpm.toFixed(1)}" class="${near ? 'rec' : ''}" style="height:${h.toFixed(0)}%"></i>`;
  }
  ticks.innerHTML = html;
  labels.innerHTML = '';
  for (let b = 80; b <= 180; b += 10) labels.innerHTML += `<span data-b="${b}" style="left:${pct(b)}%">${b}</span>`;
}

function updateMeta(r) {
  meta.classList.remove('swap'); void meta.offsetWidth; meta.classList.add('swap');
  $('metaCat').textContent = r.cat;
  $('metaGenre').textContent = r.genre;
  $('metaTitle').textContent = r.title;
  $('metaSub').textContent = `${r.bpm} BPM · ${r.flow[0].split(' — ')[0]} → ${r.flow[r.flow.length - 1].split(' — ')[0]}`;
  meta.style.setProperty('--rec-ac', r.pal.fg);
  $('rulerMarker').style.left = `${pct(r.bpm)}%`;
  $('ruler').setAttribute('aria-valuenow', r.bpm);
  $('ruler').setAttribute('aria-valuetext', `${r.bpm} BPM, ${r.title}`);
  $('rulerTicks').querySelectorAll('i').forEach((t) => t.classList.toggle('past', +t.dataset.bpm <= r.bpm));
  $('rulerLabels').querySelectorAll('span').forEach((s) => s.classList.toggle('on', Math.abs(+s.dataset.b - r.bpm) < 5));
}

buildRuler();

// ------------------------------------------------------------ deck
const deckUI = new DeckUI({
  records: RECORDS,
  onState: ({ rec, playing }) => {
    $('platterNow').textContent = rec ? `${rec.cat} ${rec.title}` : 'Needle up';
    $('platterDot').classList.toggle('live', playing);
    $('npDot').classList.toggle('live', playing);
    document.body.classList.toggle('playing', playing);
    if (rec) document.body.style.setProperty('--beat', `${60 / rec.bpm}s`);
    document.querySelector('.decks').style.setProperty('--glow', playing ? 1 : 0.5);
    shelf.markOnDeck(rec);
  },
});

// ------------------------------------------------------------ shelf
let prefetchT;
const shelf = new Shelf({
  records: RECORDS,
  stage: $('shelfStage'), ring: $('shelfRing'), ledge: $('shelfLedge'), wrap: $('shelfWrap'), tip: $('spineTip'),
  onChange: (r) => {
    updateMeta(r);
    clearTimeout(prefetchT);
    prefetchT = setTimeout(() => (window.requestIdleCallback || setTimeout)(() => renderRecord(r)), 1100);
  },
  onSpin: (r) => spin(r),
});
updateMeta(shelf.record);

async function spin(r) {
  deckUI.prime(); // unlock audio inside the click
  const el = shelf.selectedEl();
  el.classList.add('pulling');
  renderRecord(r);
  await wait(reduced ? 0 : 700);
  const tt = $('turntable').getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + tt.top - Math.max(70, (window.innerHeight - tt.height) / 2), behavior: reduced ? 'auto' : 'smooth' });
  await wait(reduced ? 0 : 900);
  el.classList.remove('pulling');
  deckUI.load(r, { autoplay: true });
}

$('prevRec').addEventListener('click', () => shelf.go(-1));
$('nextRec').addEventListener('click', () => shelf.go(1));
$('spinBtn').addEventListener('click', () => spin(shelf.record));

// ruler: click / drag to the nearest record by tempo
const ruler = $('ruler');
const pickAt = (x) => {
  const b = ruler.getBoundingClientRect();
  const bpm = BPM_MIN + ((x - b.left) / b.width) * (BPM_MAX - BPM_MIN);
  let best = RECORDS[0];
  RECORDS.forEach((r) => { if (Math.abs(r.bpm - bpm) < Math.abs(best.bpm - bpm)) best = r; });
  if (best !== shelf.record) shelf.goToRecord(best.index);
};
let rulerDown = false;
ruler.addEventListener('pointerdown', (e) => { rulerDown = true; ruler.setPointerCapture(e.pointerId); pickAt(e.clientX); });
ruler.addEventListener('pointermove', (e) => rulerDown && pickAt(e.clientX));
ruler.addEventListener('pointerup', () => (rulerDown = false));
ruler.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); shelf.goToRecord((shelf.record.index + 1) % RECORDS.length); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); shelf.goToRecord((shelf.record.index - 1 + RECORDS.length) % RECORDS.length); }
});

// keyboard browsing while the crate is on screen
let crateVisible = true;
new IntersectionObserver(([e]) => (crateVisible = e.intersectionRatio > 0.4), { threshold: [0, 0.4, 1] }).observe($('crate'));
window.addEventListener('keydown', (e) => {
  if (!crateVisible || e.target.closest('input, textarea, select, .ruler')) return;
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
const darkSections = [...document.querySelectorAll('.decks, .book, .footer')];
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
document.querySelectorAll('.reveal, .portrait-sleeve').forEach((el) => io.observe(el));
new IntersectionObserver(([e]) => document.querySelector('.book').classList.toggle('in', e.isIntersecting)).observe(document.querySelector('.book'));

initBooking(RECORDS);
