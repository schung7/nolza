# Nolza — DJ site

A one-page site for booking a DJ, built around a record crate and a working turntable.

- **The crate (hero):** a curved 3D shelf of record cases. Browse with the arrows, the keyboard, a drag or the tempo ruler. Click the selected sleeve (or **Spin it**) and the disc slides out and goes to the decks.
- **The booth:** two turntables and a two-channel mixer. Each deck has start/stop, 33/45, a ±8% pitch fader, a cue lever and scratching (drag the vinyl, backwards too). The mixer has trim, 3-band EQ (with full cut), a channel fader and a level meter per channel, plus a crossfader and master volume. Everything is generated in the browser or streamed, with no audio files.
- **About:** liner notes and a portrait.
- **Services:** three booking formats and a "how it works" tracklist.
- **Booking:** an order-slip style request form.

It's plain HTML, CSS and JS modules. There's no build step and no dependencies.

## Run locally

ES modules need a web server (opening the file directly won't work):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Page order

1. **Top:** what you offer and a "Check your date" button. Each of the three service shortcuts jumps to the booking form with that event type already selected.
2. **Kind words:** a scrolling band of client reviews (it pauses on hover or keyboard focus) and a list of venues you've played.
3. **The crate:** the record catalog (the live chart, by genre).
4. **The booth:** two turntables and a mixer.
5. About, services and packages, and the booking form.

### Reviews and venues

Edit `js/reviews.js`. Each review has a quote, a name, the event type, optional venue, city and year, and an optional star rating (only add one if it comes from a real rating). Entries marked `placeholder: true` are drawn as dashed "add yours" cards, so nothing looks like a real review until it is one. Replace them and delete the placeholders. Five or six reviews make a good scroll.

## Customise

| What | Where |
| --- | --- |
| Booking email, form backend, social links | `js/config.js` |
| The live chart (on/off, country) | `js/config.js` |
| The generated sets (titles, genres, BPM, colours, blurbs) | `js/records.js` |
| Reviews and venues you've played | `js/reviews.js` |
| Top section, About text, services, process steps | `index.html` |
| Your photo | Add `assets/portrait.jpg` (square works best). A styled placeholder shows until you do. |
| Colours and fonts | CSS variables at the top of `css/styles.css` (the accent is one setting: `--accent-rgb`, plus its tint, hover shade and button text colour) |

### Booking form delivery

With `formEndpoint` empty, submitting opens the visitor's email app with the request pre-filled and addressed to `email`. To receive requests without relying on that, create a form endpoint (for example Formspree, Basin or Getform) and paste its URL into `formEndpoint`. The form will then POST JSON to it.

### The chart crate

By default the crate shows Apple's live **iTunes Top Songs** chart (`js/chart.js`). Each song is a record with its real cover art. Dropping it on the turntable streams Apple's 30-second preview, with scratching, pitch and spin-down. When a preview ends, the next song plays. Each song links to Apple Music, and the page credits "Previews courtesy of Apple Music".

- **Auto-mix:** while one deck plays, the next chart song is dropped onto the other deck. About 11 seconds before the end, that deck's pitch fader moves to match the tempo (within ±8%), its platter starts with the record held, and the needle drops. Then the record is released so its kick and bass hits land on the current song's, and the crossfader slides across over 8 seconds. The decks swap roles and the finished deck gets the following record. When tempos are too far apart it does a plain 5-second blend instead. The **Auto** button on the mixer turns it off, and the choice is remembered on that device. Touching the crossfader takes over from the automation.
- **Genres:** buttons above the crate switch between Apple's genre charts (All, Pop, Hip-Hop, R&B, Dance, Electronic, Country, Latin, K-Pop, Rock, Alternative, Reggae, Jazz). Whatever is playing keeps playing, and the auto-mix carries on into the new genre. Each visitor's choice is remembered on their device. Edit the list in `GENRES` in `js/chart.js`.
- Change the store country or the starting genre, or turn the chart off, in `js/config.js` (`chart`).
- Previews are kept in memory only, four at a time, and are never saved to disk or browser storage.
- If the chart can't be reached, the site falls back to the generated sets below.
- **Apple's terms:** Apple's preview terms say previews are for promoting the songs (with a store link and credit), streamed only, and not for "independent entertainment value". Using them on a turntable you can scratch goes beyond that, and Apple can ask for previews to be removed. If that happens, set `chart.enabled` to `false`.

### Records and sound

Each record's `style` picks the beat and instrument pattern (`lofi`, `boombap`, `rnb`, `disco`, `nudisco`, `afro`, `deephouse`, `house`, `openformat`, `anthem`, `techno`, `dnb`). `key` is the root note as a MIDI number, and `motif` picks the generated cover art (`waves`, `blocks`, `rings`, `mirrorball`, `sun`, `kente`, `grid`, `halftone`, `type`, `eq`, `tunnel`, `spiral`).

## Brand

The logo is **놀자.**: 놀자 set in Pretendard Black with a champagne-gold full stop. The files in `assets/brand/` are outlined, so they don't need the font installed:

- `nolza-logo.svg` / `.png`: dark logo for light backgrounds
- `nolza-logo-light.svg` / `.png`: light logo for dark backgrounds
- `nolza-logo-mono.svg`: one colour, for print or engraving
- `nolza-icon.svg`, `nolza-icon-512.png`, `apple-touch-icon.png`, `favicon-32.png`: the 놀. app icon
- `nolza-icon-gold.svg` / `-512.png`: gold variant for profile pictures

On the site, the full stop pulses on the beat while a record is playing.

## Deploy

Any static host works: GitHub Pages (Settings → Pages → deploy from branch), Netlify, Vercel or Cloudflare Pages. Upload the folder as-is.
