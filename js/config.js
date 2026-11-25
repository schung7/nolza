// ---------------------------------------------------------------------------
// Site settings — edit these.
// ---------------------------------------------------------------------------
export const CONFIG = {
  // Where booking requests go. Used for the mailto fallback and shown on the page.
  email: 'bookings@nolza.example',

  // Optional: a form backend endpoint (e.g. Formspree "https://formspree.io/f/xxxx",
  // Basin, Getform…). When set, the booking form POSTs here instead of opening
  // the visitor's email app.
  formEndpoint: '',

  // The crate shows Apple's live iTunes Top Songs chart, playing 30-second
  // previews on the turntable. Set enabled: false to use the generated sets
  // in js/records.js instead. country is a two-letter store code (us, gb, kr…).
  chart: { enabled: true, country: 'us' },

  socials: {
    instagram: 'https://instagram.com/',
    soundcloud: 'https://soundcloud.com/',
  },
};
