// Booking form: chips, validation, and sending (form backend or mailto).

import { CONFIG } from './config.js';

export function initBooking(records) {
  const form = document.getElementById('bookingForm');
  const msg = document.getElementById('formMsg');
  const hours = document.getElementById('hours');
  const hoursOut = document.getElementById('hoursOut');
  const vibes = document.getElementById('vibeChips');
  const submit = form.querySelector('.submit');

  // links
  const mail = document.getElementById('mailLink');
  mail.href = `mailto:${CONFIG.email}`; mail.textContent = CONFIG.email;
  document.querySelectorAll('[data-social]').forEach((a) => {
    const url = CONFIG.socials[a.dataset.social];
    if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; } else a.remove();
  });

  // order number
  const d = new Date();
  document.getElementById('slipNo').textContent = `No. ${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 900) + 100)}`;
  form.date.min = d.toISOString().slice(0, 10);

  vibes.innerHTML = records.map((r) => `<label><input type="checkbox" name="vibes" value="${r.title} (${r.genre})" /><span><em style="background:${r.pal.chip || r.pal.fg}"></em>${r.genre}</span></label>`).join('');

  const setHours = () => { hoursOut.textContent = `${hours.value} hr${hours.value === '1' ? '' : 's'}`; };
  hours.addEventListener('input', setHours); setHours();

  // "Book this format" buttons
  document.querySelectorAll('[data-book]').forEach((b) => b.addEventListener('click', () => {
    const r = form.querySelector(`input[name=event][value="${b.dataset.book}"]`);
    if (r) r.checked = true;
    document.getElementById('book').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => form.name.focus({ preventScroll: true }), 900);
  }));

  form.addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('invalid'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const fd = new FormData(form);
    const bad = [];
    const need = (name, ok) => { if (!ok) { bad.push(name); (form.elements[name]?.closest?.('.field') || form.elements[name]?.[0]?.closest('.field'))?.classList.add('invalid'); } };
    need('event', !!fd.get('event'));
    need('name', (fd.get('name') || '').trim().length > 1);
    need('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fd.get('email') || ''));
    need('date', !!fd.get('date'));
    need('venue', (fd.get('venue') || '').trim().length > 1);
    if (bad.length) { msg.textContent = 'A few details are missing — check the highlighted fields.'; return; }

    const data = {
      event: fd.get('event'), name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'),
      date: fd.get('date'), venue: fd.get('venue'), guests: fd.get('guests'), hours: fd.get('hours'),
      vibes: fd.getAll('vibes').join(', ') || '—', message: fd.get('message') || '—',
    };

    submit.classList.add('sending'); submit.disabled = true;
    try {
      if (CONFIG.formEndpoint) {
        const res = await fetch(CONFIG.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ...data, _subject: `Booking request — ${data.event}, ${data.date}` }) });
        if (!res.ok) throw new Error(res.status);
      } else {
        const body = [
          `Event: ${data.event}`, `Date: ${data.date}`, `Venue / city: ${data.venue}`, `Guests: ${data.guests}`, `Set length: ${data.hours} hrs`,
          `Vibes: ${data.vibes}`, '', data.message, '', `— ${data.name}`, data.email, data.phone || '',
        ].join('\n');
        window.location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(`Booking request — ${data.event}, ${data.date}`)}&body=${encodeURIComponent(body)}`;
        await new Promise((r) => setTimeout(r, 700));
      }
      document.getElementById('stampDate').textContent = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      form.classList.add('done');
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('slipDone').setAttribute('aria-hidden', 'false');
    } catch (err) {
      msg.innerHTML = `Couldn’t send that — please email <a href="mailto:${CONFIG.email}">${CONFIG.email}</a> directly.`;
    } finally {
      submit.classList.remove('sending'); submit.disabled = false;
    }
  });

  document.getElementById('slipAgain').addEventListener('click', () => {
    form.reset(); setHours(); form.classList.remove('done');
    document.getElementById('slipDone').setAttribute('aria-hidden', 'true');
  });
}
