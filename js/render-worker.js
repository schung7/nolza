// Renders records off the main thread so the page never stalls.
import { renderAll } from './synth.js';

self.onmessage = ({ data: { id, rec } }) => {
  try {
    const { sr, channels } = renderAll(rec);
    self.postMessage({ id, sr, channels }, channels.map((c) => c.buffer));
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
