let cachedAudioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const AudioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  if (!cachedAudioContext) {
    cachedAudioContext = new AudioContextCtor();
  }

  return cachedAudioContext;
};

const playTone = (
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  gainAmount: number,
  type: OscillatorType,
): void => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainAmount, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
};

export const playCompletionBell = (): void => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    playTone(ctx, 1318.51, now, 0.16, 0.1, 'triangle');
    playTone(ctx, 1760.0, now + 0.07, 0.22, 0.08, 'sine');
  } catch {
    // Ignore audio failures; visual UI still reflects completion.
  }
};
