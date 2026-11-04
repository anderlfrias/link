/**
 * Generador de tonos de llamada mediante Web Audio API.
 * No requiere descargar archivos de audio externos.
 */

let audioCtx: AudioContext | null = null;
let activeInterval: NodeJS.Timeout | null = null;
let activeOscillators: OscillatorNode[] = [];
let activeGain: GainNode | null = null;

let unlockArmed = false;

/**
 * Una llamada que entra sin que la persona haya tocado la página (la abrió desde una notificación)
 * encuentra el audio bloqueado por el navegador: no suena nada hasta el primer gesto. Se desbloquea
 * en el primer toque o tecla. Mientras tanto las ráfagas se omiten: si se encolaran, sonarían todas
 * juntas al desbloquear.
 */
function armAudioUnlock(ctx: AudioContext): void {
  if (unlockArmed) return;
  unlockArmed = true;
  const unlock = () => {
    unlockArmed = false;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    void ctx.resume();
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
    armAudioUnlock(audioCtx);
  }
  return audioCtx;
}

export function stopAllTones(): void {
  if (activeInterval) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
  for (const osc of activeOscillators) {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      // ignore
    }
  }
  activeOscillators = [];
  if (activeGain) {
    try {
      activeGain.disconnect();
    } catch {
      // ignore
    }
    activeGain = null;
  }
}

export function resetAudioContextForTesting(): void {
  stopAllTones();
  audioCtx = null;
  unlockArmed = false;
}

/**
 * Tono de llamada entrante: Chime melódico repetitivo (C5 + E5 -> 523.25Hz y 659.25Hz).
 */
export function playIncomingRingtone(): void {
  stopAllTones();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playBurst = () => {
    // Bloqueado (suspended) o cerrado: no se encola nada (ver `armAudioUnlock`).
    if (!audioCtx || audioCtx.state !== "running") return;
    try {
      const now = audioCtx.currentTime;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.2); // E5
      osc1.frequency.setValueAtTime(783.99, now + 0.4); // G5

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(261.63, now); // C4

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
      gain.gain.setValueAtTime(0.2, now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.3);
      osc2.stop(now + 1.3);

      activeOscillators.push(osc1, osc2);
    } catch {
      // ignore audio errors
    }
  };

  if (ctx.state === "running") {
    playBurst();
  } else {
    // `resume()` tarda un instante (o queda pendiente hasta el primer gesto): la primera ráfaga sale
    // cuando el audio se libera, si la llamada sigue sonando. Sin esto, la primera tardaría 2,5 s.
    void Promise.resolve(ctx.resume())
      .then(() => {
        if (activeInterval) playBurst();
      })
      .catch(() => {});
  }
  activeInterval = setInterval(playBurst, 2500);
}

/**
 * Tono de llamada saliente: Tono clásico de ringback (440Hz + 480Hz durante 1.5s cada 3.5s).
 */
export function playOutgoingRingtone(): void {
  stopAllTones();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playBeep = () => {
    if (!audioCtx || audioCtx.state === "closed") return;
    try {
      const now = audioCtx.currentTime;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(440, now);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
      gain.gain.setValueAtTime(0.12, now + 1.4);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.5);
      osc2.stop(now + 1.5);

      activeOscillators.push(osc1, osc2);
    } catch {
      // ignore
    }
  };

  playBeep();
  activeInterval = setInterval(playBeep, 4000);
}

/**
 * Tono de finalización o error: Dos beeps cortos descendentes.
 */
export function playEndCallTone(): void {
  stopAllTones();
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.setValueAtTime(360, now + 0.15);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // ignore
  }
}
