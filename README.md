# Nolza — DJ site

A one-page site for booking a DJ, built around a record crate and a working turntable.

- **The crate (hero):** a curved 3D shelf of record cases. Browse with the arrows, the keyboard, a drag or the tempo ruler. Click the selected sleeve (or **Spin it**) and the disc slides out and goes to the decks.
- **The decks:** a turntable that plays every record live. The music is synthesised in the browser, so there are no audio files. It has motor spin-up and spin-down, 33/45, a ±8% pitch fader, a cue lever and scratching (drag the vinyl, backwards too).
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

## Customise

| What | Where |
| --- | --- |
| Booking email, form backend, social links | `js/config.js` |
| The live chart (on/off, country) | `js/config.js` |
| The generated sets (titles, genres, BPM, colours, blurbs) | `js/records.js` |
| About text, services, process steps | `index.html` |
| Your photo | Add `assets/portrait.jpg` (square works best). A styled placeholder shows until you do. |
| Colours and fonts | CSS variables at the top of `css/styles.css` |

### Booking form delivery

With `formEndpoint` empty, submitting opens the visitor's email app with the request pre-filled and addressed to `email`. To receive requests without relying on that, create a form endpoint (for example Formspree, Basin or Getform) and paste its URL into `formEndpoint`. The form will then POST JSON to it.

### The chart crate

By default the crate shows Apple's live **iTunes Top Songs** chart (`js/chart.js`). Each song is a record with its real cover art. Dropping it on the turntable streams Apple's 30-second preview, with scratching, pitch and spin-down. When a preview ends, the next song plays. Each song links to Apple Music, and the page credits "Previews courtesy of Apple Music".

- **Auto-mix:** about 8 seconds before a preview ends, the next song starts underneath it and crossfades in. When the two tempos are within ±8%, the incoming song is sped up or slowed down to match, and started so its kick and bass hits land on the current song's. It then takes over the turntable without a gap, and the pitch fader shows the speed it's running at. When the tempos are too far apart, it does a plain 5-second blend instead. The **Auto-mix** button turns it off, and the choice is remembered on that device.
- **Genres:** buttons above the crate switch between Apple's genre charts (All, Pop, Hip-Hop, R&B, Dance, Electronic, Country, Latin, K-Pop, Rock, Alternative, Reggae, Jazz). Whatever is playing keeps playing, and the auto-mix carries on into the new genre. Each visitor's choice is remembered on their device. Edit the list in `GENRES` in `js/chart.js`.
- Change the store country or the starting genre, or turn the chart off, in `js/config.js` (`chart`).
- Previews are kept in memory only, four at a time, and are never saved to disk or browser storage.
- If the chart can't be reached, the site falls back to the generated sets below.
- **Apple's terms:** Apple's preview terms say previews are for promoting the songs (with a store link and credit), streamed only, and not for "independent entertainment value". Using them on a turntable you can scratch goes beyond that, and Apple can ask for previews to be removed. If that happens, set `chart.enabled` to `false`.

### Records and sound

Each record's `style` picks the beat and instrument pattern (`lofi`, `boombap`, `rnb`, `disco`, `nudisco`, `afro`, `deephouse`, `house`, `openformat`, `anthem`, `techno`, `dnb`). `key` is the root note as a MIDI number, and `motif` picks the generated cover art (`waves`, `blocks`, `rings`, `mirrorball`, `sun`, `kente`, `grid`, `halftone`, `type`, `eq`, `tunnel`, `spiral`).

## Brand

The logo is **놀자.**: 놀자 set in Pretendard Black with an orange full stop. The files in `assets/brand/` are outlined, so they don't need the font installed:

- `nolza-logo.svg` / `.png`: dark logo for light backgrounds
- `nolza-logo-light.svg` / `.png`: light logo for dark backgrounds
- `nolza-logo-mono.svg`: one colour, for print or engraving
- `nolza-icon.svg`, `nolza-icon-512.png`, `apple-touch-icon.png`, `favicon-32.png`: the 놀. app icon
- `nolza-icon-orange.svg` / `-512.png`: orange variant for profile pictures

On the site, the full stop pulses on the beat while a record is playing.

## Deploy

Any static host works: GitHub Pages (Settings → Pages → deploy from branch), Netlify, Vercel or Cloudflare Pages. Upload the folder as-is.
