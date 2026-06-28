/**
 * Sound effects, synthesized with the Web Audio API.
 *
 * No audio asset files: every effect is generated from oscillators / noise so
 * the PWA works fully offline and we keep precise control over each cue. All
 * sounds are gated behind a user-toggleable mute flag (persisted) and the
 * AudioContext is created lazily on the first sound after a user gesture
 * (browsers block audio before any interaction).
 */

export type SoundName =
  | "playCard"
  | "trickWin"
  | "turnTick"
  | "invite"
  | "friendRequest"
  | "sticker"
  | "trumpChosen"
  | "gameWin"
  | "cardDraw";

const STORAGE_KEY = "varagh.sound";

let enabled = readEnabled();
let ctx: AudioContext | null = null;
const listeners = new Set<(on: boolean) => void>();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* ignore quota/availability errors */
  }
  if (on) void getCtx()?.resume();
  listeners.forEach((l) => l(on));
}

export function subscribeSound(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** A single shaped oscillator note. */
function tone(
  ac: AudioContext,
  opts: {
    freq: number;
    start: number;
    duration: number;
    type?: OscillatorType;
    gain?: number;
    endFreq?: number;
  },
): void {
  const { freq, start, duration, type = "sine", gain = 0.18, endFreq } = opts;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
  // Quick attack, smooth exponential release — avoids clicks.
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** A short filtered noise burst — for card flicks / swishes. */
function noise(
  ac: AudioContext,
  opts: { start: number; duration: number; gain?: number; cutoff?: number },
): void {
  const { start, duration, gain = 0.12, cutoff = 2400 } = opts;
  const frames = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Fade out so it reads as a flick, not a hiss.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(start);
  src.stop(start + duration + 0.02);
}

const RECIPES: Record<SoundName, (ac: AudioContext, t0: number) => void> = {
  playCard: (ac, t) => {
    noise(ac, { start: t, duration: 0.09, gain: 0.13, cutoff: 1800 });
    tone(ac, { freq: 220, endFreq: 130, start: t, duration: 0.1, type: "triangle", gain: 0.1 });
  },
  cardDraw: (ac, t) => {
    noise(ac, { start: t, duration: 0.16, gain: 0.08, cutoff: 3200 });
  },
  trickWin: (ac, t) => {
    tone(ac, { freq: 523.25, start: t, duration: 0.14, type: "triangle", gain: 0.16 });
    tone(ac, { freq: 783.99, start: t + 0.1, duration: 0.18, type: "triangle", gain: 0.16 });
  },
  turnTick: (ac, t) => {
    tone(ac, { freq: 880, start: t, duration: 0.07, type: "square", gain: 0.05 });
  },
  invite: (ac, t) => {
    tone(ac, { freq: 587.33, start: t, duration: 0.16, type: "sine", gain: 0.15 });
    tone(ac, { freq: 880, start: t + 0.13, duration: 0.22, type: "sine", gain: 0.15 });
  },
  friendRequest: (ac, t) => {
    tone(ac, { freq: 659.25, start: t, duration: 0.14, type: "sine", gain: 0.14 });
    tone(ac, { freq: 987.77, start: t + 0.12, duration: 0.2, type: "sine", gain: 0.14 });
  },
  sticker: (ac, t) => {
    tone(ac, { freq: 440, endFreq: 880, start: t, duration: 0.12, type: "sine", gain: 0.12 });
  },
  trumpChosen: (ac, t) => {
    [392, 523.25, 659.25, 783.99].forEach((f, i) =>
      tone(ac, { freq: f, start: t + i * 0.07, duration: 0.18, type: "triangle", gain: 0.13 }),
    );
  },
  gameWin: (ac, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(ac, { freq: f, start: t + i * 0.12, duration: 0.3, type: "triangle", gain: 0.17 }),
    );
  },
};

export function playSound(name: SoundName): void {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  try {
    RECIPES[name](ac, ac.currentTime + 0.001);
  } catch {
    /* never let a sound failure bubble into gameplay */
  }
}
