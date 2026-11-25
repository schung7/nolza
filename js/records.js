// The crate. Each record is one of the DJ's signature sets.
// Edit titles, blurbs and "flow" freely; `style` picks the live audio engine
// pattern, `motif` picks the generated cover art.
//
// pal: bg = sleeve background, fg = main art colour, ac = accent,
//      tx = text on the sleeve, vinyl = colour of the pressing, chip = optional dot colour on light backgrounds.

export const RECORDS = [
  {
    cat: 'NZ-001', title: 'Low Tide Lounge', genre: 'Lo-fi & Jazz Hop', bpm: 82,
    style: 'lofi', key: 50, motif: 'waves',
    pal: { bg: '#cfe3dc', fg: '#2f6f73', ac: '#f2b880', tx: '#173c3e', vinyl: '#141414' },
    blurb: 'Dusty keys, soft kicks and a little tape hiss. Built for cocktail hour, dinner service and the first slow hour of the night.',
    flow: ['Arrivals — instrumental soul', 'Dinner — jazz-hop & bossa flips', 'Golden hour — warm R&B edits'],
  },
  {
    cat: 'NZ-002', title: 'Block Party Physics', genre: 'Hip-Hop Classics', bpm: 92,
    style: 'boombap', key: 43, motif: 'blocks',
    pal: { bg: '#f4c430', fg: '#141414', ac: '#e5502f', tx: '#141414', vinyl: '#141414', chip: '#f4c430' },
    blurb: 'Golden-era breaks, crowd-call hooks and the records everybody knows the second verse to.',
    flow: ['Breaks & classic loops', 'Sing-along hooks', 'Back-to-back bangers'],
  },
  {
    cat: 'NZ-003', title: 'Velvet Rope', genre: 'R&B Slow Jams', bpm: 96,
    style: 'rnb', key: 51, motif: 'rings',
    pal: { bg: '#6d1f2f', fg: '#f3b6c4', ac: '#ffd9a8', tx: '#fde8ec', vinyl: '#5a1020', chip: '#b0405a' },
    blurb: "Silky 90s and 00s R&B, smooth enough for a first dance and grown enough for the after-party.",
    flow: ['Slow burn — 90s quiet storm', 'Two-step — 00s R&B', 'Late night — modern R&B'],
  },
  {
    cat: 'NZ-004', title: 'Mirrorball Cardio', genre: 'Disco & Boogie', bpm: 116,
    style: 'disco', key: 53, motif: 'mirrorball',
    pal: { bg: '#2b1f4a', fg: '#d9d6ef', ac: '#ff7ac6', tx: '#f3f0ff', vinyl: '#141414', chip: '#ff7ac6' },
    blurb: 'Strings, slap bass and four-on-the-floor. The set that gets the aunties and the interns on the same floor.',
    flow: ['Philly strings', 'Boogie & funk', 'Peak-time disco anthems'],
  },
  {
    cat: 'NZ-005', title: 'Golden Hour Spritz', genre: 'Nu-Disco & Balearic', bpm: 118,
    style: 'nudisco', key: 57, motif: 'sun',
    pal: { bg: '#ffd6b8', fg: '#e5502f', ac: '#ff9e5e', tx: '#5a2312', vinyl: '#e8783c' },
    blurb: 'Sunset grooves with a little sparkle — rooftop parties, beach weddings, anything with a view.',
    flow: ['Balearic warm-up', 'Nu-disco cruise', 'Sundown singalongs'],
  },
  {
    cat: 'NZ-006', title: 'Palm Wine Service', genre: 'Afro House & Amapiano', bpm: 120,
    style: 'afro', key: 48, motif: 'kente',
    pal: { bg: '#1f4d3a', fg: '#f2c14e', ac: '#e5502f', tx: '#f7efd8', vinyl: '#141414' },
    blurb: 'Rolling percussion and log-drum bounce. Hypnotic, joyful, impossible to stand still to.',
    flow: ['Percussive warm-up', 'Afro house groove', 'Amapiano bounce'],
  },
  {
    cat: 'NZ-007', title: 'Late Checkout', genre: 'Deep House', bpm: 122,
    style: 'deephouse', key: 53, motif: 'grid',
    pal: { bg: '#14244a', fg: '#7fa6ff', ac: '#ffcf6e', tx: '#e7eeff', vinyl: '#141414' },
    blurb: 'Warm chords and patient basslines for lobbies, launches and long nights that never feel rushed.',
    flow: ['Lounge-y deep cuts', 'Chord-heavy grooves', 'After-hours rollers'],
  },
  {
    cat: 'NZ-008', title: 'Basement Bloom', genre: 'House & Garage', bpm: 124,
    style: 'house', key: 55, motif: 'halftone',
    pal: { bg: '#ffb3c7', fg: '#1d5c3a', ac: '#ffffff', tx: '#16301f', vinyl: '#141414' },
    blurb: 'Piano stabs, diva vocals and shuffling garage. Classic house energy, freshly pressed.',
    flow: ['Piano house', 'UK garage shuffles', 'Hands-up classics'],
  },
  {
    cat: 'NZ-009', title: 'Night Market', genre: 'Open Format', bpm: 126,
    style: 'openformat', key: 52, motif: 'type',
    pal: { bg: '#e5502f', fg: '#fff3e0', ac: '#141414', tx: '#fff3e0', vinyl: '#141414', chip: '#e5502f' },
    blurb: 'A bit of everything, mixed tight — pop, hip-hop, Latin, K-pop and throwbacks. The default for mixed crowds.',
    flow: ['Pop & throwbacks', 'Hip-hop & Latin heat', 'K-pop & global hits'],
  },
  {
    cat: 'NZ-010', title: 'Last Call Anthems', genre: '2000s Sing-Alongs', bpm: 128,
    style: 'anthem', key: 50, motif: 'eq',
    pal: { bg: '#1b3b8f', fg: '#ffe066', ac: '#7ee0ff', tx: '#ffffff', vinyl: '#2a54c4' },
    blurb: 'Big choruses, bigger drops. The last forty minutes where every single person is singing.',
    flow: ['Pop-punk & indie', 'Club bangers of the 00s', 'The final three'],
  },
  {
    cat: 'NZ-011', title: 'Concrete Bloom', genre: 'Techno', bpm: 132,
    style: 'techno', key: 45, motif: 'tunnel',
    pal: { bg: '#d7d7d2', fg: '#141414', ac: '#c6ff3d', tx: '#141414', vinyl: '#141414', chip: '#c6ff3d' },
    blurb: 'Hypnotic, driving and a little acid. For warehouse nights and fashion-week afters.',
    flow: ['Hypnotic openers', 'Acid lines', 'Peak-time pressure'],
  },
  {
    cat: 'NZ-012', title: 'Afterburner', genre: 'Drum & Bass', bpm: 174,
    style: 'dnb', key: 50, motif: 'spiral',
    pal: { bg: '#121212', fg: '#ff6a2b', ac: '#f2f2f2', tx: '#f2f2f2', vinyl: '#141414' },
    blurb: 'Rolling breaks and rib-cage bass. Liquid early, jump-up late — for crowds that came to sweat.',
    flow: ['Liquid rollers', 'Jungle breaks', 'Jump-up finale'],
  },
];

RECORDS.forEach((r, i) => { r.index = i; r.id = r.cat; });
