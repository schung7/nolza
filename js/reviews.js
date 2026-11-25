// ---------------------------------------------------------------------------
// Reviews and venues — replace these placeholders with your real ones.
//
// REVIEWS: one entry per client quote. Keep quotes to 1–3 sentences.
//   quote   what they said (use their exact words)
//   name    how they'd like to be credited, e.g. "Jess & Sam" or "Priya K."
//   event   the kind of event, e.g. "Wedding", "Company holiday party"
//   where   optional: venue and/or city, and the year
//   rating  optional: 1–5 stars, only if it comes from a real rating
//
// VENUES: the places you've played, shown under the reviews.
//   name    venue name
//   city    optional city
//
// While an entry still has `placeholder: true` it's drawn as a dashed
// "add yours" card, so nothing on the live site looks like a real review
// before it is one. Delete the placeholders once you've added your own.
// ---------------------------------------------------------------------------

export const REVIEWS = [
  { placeholder: true, quote: 'Add a client’s review here — two or three sentences reads best.', name: 'Client name', event: 'Wedding', where: 'Venue, City · Year' },
  { placeholder: true, quote: 'A second review, ideally from a different kind of event.', name: 'Client name', event: 'Private party', where: 'Venue, City · Year' },
  { placeholder: true, quote: 'Corporate clients love seeing other companies here.', name: 'Name, Company', event: 'Corporate event', where: 'Venue, City · Year' },
  { placeholder: true, quote: 'A promoter or venue manager vouching for a club night.', name: 'Name, Venue', event: 'Club night', where: 'City · Year' },
  { placeholder: true, quote: 'Five or six reviews keeps the scroll from repeating too soon.', name: 'Client name', event: 'Birthday', where: 'Venue, City · Year' },
];

export const VENUES = [
  { placeholder: true, name: 'Venue name', city: 'City' },
  { placeholder: true, name: 'Venue name', city: 'City' },
  { placeholder: true, name: 'Venue name', city: 'City' },
  { placeholder: true, name: 'Venue name', city: 'City' },
  { placeholder: true, name: 'Venue name', city: 'City' },
  { placeholder: true, name: 'Venue name', city: 'City' },
];
