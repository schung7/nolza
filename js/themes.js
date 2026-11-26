// ---------------------------------------------------------------------------
// Site themes — one look and voice per kind of client.
//
// Visitors get a theme from the link they follow:
//   …/nolza/?for=wedding   or the short link  …/nolza/wedding/
//   …/nolza/?for=club      or                 …/nolza/club/
// or from the switch in the header. Their choice is remembered on their
// device. With neither, CONFIG.theme (js/config.js) is used.
//
// copy: text for elements marked data-copy="key" in index.html. Anything a
// theme leaves out keeps the text written in index.html (the club wording).
// ---------------------------------------------------------------------------

export const THEMES = {
  club: {
    label: 'Club',
    themeColor: '#07060b',
    genre: '17',                       // the crate opens on the Dance chart
    dark: '.reviews, .decks, .book, .footer',
    eventFirst: null,
    copy: {},
  },

  wedding: {
    label: 'Weddings',
    themeColor: '#f6f2ea',
    genre: '',                         // the crate opens on the overall chart
    dark: '.decks, .footer',
    eventFirst: 'wedding',             // wedding reviews lead the scroll
    preselect: 'Wedding',              // booking form starts on "Wedding"
    copy: {
      'hero.kicker': 'Wedding DJ &amp; MC · now booking',
      'hero.title': 'Your day,<br /><em>perfectly played.</em>',
      'hero.lede': 'From the walk down the aisle to the last dance, Nolza (<span class="ko">놀자</span>, “let’s play”) plans every moment with you: a personal planning call, your must-play and do-not-play lists, MC duties and pro sound, all included.',
      'hero.cta': 'Check your wedding date',
      'hero.cta2': 'See wedding packages',
      'hero.s1': '<span class="mono">I</span><b>Ceremony</b><i>Walk down the aisle to the perfect song</i>',
      'hero.s2': '<span class="mono">II</span><b>Cocktails &amp; dinner</b><i>Easy, warm music while everyone mingles</i>',
      'hero.s3': '<span class="mono">III</span><b>Reception</b><i>A full floor right up to the last dance</i>',
      'hero.sticker': 'Just<br />married',
      'hero.side': 'SIDE A · YOUR FIRST DANCE',
      'reviews.kicker': 'From our couples',
      'reviews.title': 'Kind words.',
      'decks.lede': 'Hear the sound of your day: every record in the crate plays live here, mixed the way your dance floor will be.',
    },
    book: { s1: 'Wedding', s2: 'Wedding', s3: 'Wedding' },
  },
};

export const THEME_IDS = Object.keys(THEMES);
