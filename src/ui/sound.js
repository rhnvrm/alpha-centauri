// Minimal WebAudio cues: a short transmit chirp and an incoming-letter tone.
// Created lazily on the first user gesture so autoplay policies are respected.
let ctx = null;
function ensure() {
  try {
    if (!ctx) { const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
export function playTone(freq, duration = 0.08, volume = 0.04, type = 'sine', when = 0) {
  const ac = ensure(); if (!ac) return;
  const osc = ac.createOscillator(); const gain = ac.createGain();
  osc.type = type; osc.frequency.value = freq;
  const t = ac.currentTime + when;
  gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain); gain.connect(ac.destination); osc.start(t); osc.stop(t + duration + 0.02);
}
export const transmitChirp = () => { playTone(660, 0.09, 0.05, 'triangle'); playTone(990, 0.12, 0.03, 'sine', 0.08); };
export const arrivalChime = () => { playTone(520, 0.1, 0.045, 'sine'); playTone(780, 0.16, 0.03, 'sine', 0.1); };