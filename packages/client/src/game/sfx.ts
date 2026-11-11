/**
 * Petits sons fabriqués par le navigateur (Web Audio, aucun fichier) pour les jeux de salon :
 * cris des bêtes de « Cris en folie », sonnerie de « Cache-cache », tic-tac et explosion de « Tic-tac-boum ».
 * Les navigateurs n'autorisent le son qu'après un premier toucher : `unlockAudio()` est appelé sur un clic.
 */
import type { CreatureId } from "@rzparty/shared";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** À appeler depuis un geste de l'utilisateur (toucher, clic). */
export function unlockAudio(): void {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}

export function audioReady(): boolean {
  return ctx !== null && ctx.state === "running";
}

interface Voice {
  type: OscillatorType;
  /** Fréquences (Hz) aux instants donnés (secondes). */
  freq: [number, number][];
  /** Volume (0-1) aux instants donnés. */
  gain: [number, number][];
  /** Vibrato léger (Hz, profondeur). */
  vibrato?: [number, number];
  /** Filtre passe-bas (Hz). */
  lowpass?: number;
}

function play(voices: Voice[], at = 0, volume = 1): void {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + at;
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(c.destination);
  for (const v of voices) {
    const osc = c.createOscillator();
    osc.type = v.type;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    osc.frequency.setValueAtTime(v.freq[0]![1], t0);
    for (const [t, f] of v.freq.slice(1)) osc.frequency.linearRampToValueAtTime(f, t0 + t);
    for (const [t, a] of v.gain) g.gain.linearRampToValueAtTime(a, t0 + t);
    let node: AudioNode = osc;
    if (v.lowpass) {
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = v.lowpass;
      osc.connect(lp);
      node = lp;
    }
    if (v.vibrato) {
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = v.vibrato[0];
      depth.gain.value = v.vibrato[1];
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + v.gain[v.gain.length - 1]![0] + 0.05);
    }
    node.connect(g).connect(out);
    const end = v.gain[v.gain.length - 1]![0];
    osc.start(t0);
    osc.stop(t0 + end + 0.05);
  }
}

/** Bruit blanc filtré (aboiement, explosion). */
function noise(duration: number, at: number, filter: number, peak: number, volume = 1): void {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + at;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = filter;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak * volume, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  src.connect(lp).connect(g).connect(c.destination);
  src.start(t0);
}

/** Le cri d'une bête (environ une seconde). */
export function creatureCry(id: CreatureId, volume = 1): void {
  switch (id) {
    case "grenouille":
      // « Croâ croâ » : deux coassements graves et rugueux.
      for (const at of [0, 0.32]) play([{ type: "sawtooth", freq: [[0, 180], [0.08, 140], [0.18, 110]], gain: [[0.01, 0.5], [0.16, 0.4], [0.22, 0]], vibrato: [38, 30], lowpass: 900 }], at, volume);
      return;
    case "chat":
      // « Miaou » : glissé qui monte puis redescend.
      play([{ type: "triangle", freq: [[0, 520], [0.25, 880], [0.75, 560]], gain: [[0.05, 0.5], [0.6, 0.45], [0.85, 0]], vibrato: [6, 12] }], 0, volume);
      return;
    case "chien":
      // « Ouaf ouaf » : deux aboiements secs.
      for (const at of [0, 0.3]) {
        play([{ type: "square", freq: [[0, 420], [0.06, 300], [0.14, 220]], gain: [[0.01, 0.45], [0.12, 0.2], [0.16, 0]], lowpass: 1400 }], at, volume);
        noise(0.12, at, 1600, 0.35, volume);
      }
      return;
    case "vache":
      // « Meuh » : long et grave.
      play([{ type: "sawtooth", freq: [[0, 120], [0.3, 150], [1.1, 105]], gain: [[0.15, 0.5], [0.9, 0.45], [1.2, 0]], vibrato: [5, 4], lowpass: 700 }], 0, volume);
      return;
    case "canard":
      // « Coin coin » : nasillard.
      for (const at of [0, 0.25, 0.5]) play([{ type: "square", freq: [[0, 600], [0.1, 520]], gain: [[0.01, 0.35], [0.12, 0.25], [0.16, 0]], lowpass: 2200, vibrato: [60, 40] }], at, volume);
      return;
    case "hibou":
      // « Hou hou » : doux et rond.
      for (const at of [0, 0.45]) play([{ type: "sine", freq: [[0, 400], [0.15, 430], [0.35, 380]], gain: [[0.05, 0.6], [0.3, 0.5], [0.4, 0]] }], at, volume);
      return;
    case "souris":
      // « Couic couic » : très aigu et rapide.
      for (const at of [0, 0.12, 0.24, 0.45]) play([{ type: "sine", freq: [[0, 2400], [0.06, 3200]], gain: [[0.01, 0.35], [0.07, 0]] }], at, volume);
      return;
    case "coq":
      // « Cocorico » : quatre notes qui montent, la dernière tenue.
      [[0, 520, 0.12], [0.15, 660, 0.12], [0.3, 780, 0.12], [0.47, 940, 0.5]].forEach(([at, f, d]) =>
        play([{ type: "sawtooth", freq: [[0, f!], [d!, f! * 0.92]], gain: [[0.02, 0.35], [d! - 0.03, 0.3], [d!, 0]], lowpass: 2600, vibrato: [7, 10] }], at!, volume),
      );
      return;
  }
}

/** Sonnerie d'un téléphone caché : trois notes joyeuses, bien audibles. */
export function hiddenRing(volume = 1): void {
  [[0, 1320], [0.14, 1760], [0.28, 2093], [0.5, 1320], [0.64, 1760], [0.78, 2093]].forEach(([at, f]) =>
    play([{ type: "square", freq: [[0, f!]], gain: [[0.01, 0.3], [0.1, 0.22], [0.12, 0]], lowpass: 5000 }], at!, volume),
  );
}

/** Tic de la bombe (plus aigu quand elle chauffe). */
export function tick(heat: number): void {
  const f = [900, 1200, 1600][heat] ?? 900;
  play([{ type: "square", freq: [[0, f]], gain: [[0.005, 0.18], [0.04, 0]], lowpass: 4000 }]);
}

/** Petit son de réussite. */
export function success(): void {
  play([{ type: "triangle", freq: [[0, 660], [0.12, 990]], gain: [[0.01, 0.35], [0.18, 0]] }]);
}

/** Petit son d'erreur. */
export function buzz(): void {
  play([{ type: "sawtooth", freq: [[0, 180], [0.25, 120]], gain: [[0.01, 0.35], [0.28, 0]], lowpass: 900 }]);
}

export function explosion(): void {
  noise(1.4, 0, 900, 0.9);
  play([{ type: "sine", freq: [[0, 120], [0.6, 40]], gain: [[0.01, 0.8], [0.7, 0]] }]);
}

/** Empêche le téléphone de se mettre en veille (s'il le permet). Renvoie la fonction pour relâcher. */
export function keepAwake(): () => void {
  let lock: { release(): Promise<void> } | null = null;
  let released = false;
  const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
  const ask = () => {
    if (released || !nav.wakeLock || document.visibilityState !== "visible") return;
    nav.wakeLock.request("screen").then((l) => (released ? void l.release() : (lock = l)), () => {});
  };
  ask();
  document.addEventListener("visibilitychange", ask);
  return () => {
    released = true;
    document.removeEventListener("visibilitychange", ask);
    void lock?.release().catch(() => {});
  };
}
