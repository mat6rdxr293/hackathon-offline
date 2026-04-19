const WAKE_WORD_EXACT = new Set(['даму', 'дому']);

const normalizeWake = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const looksLikeDamu = (token: string): boolean => {
  if (WAKE_WORD_EXACT.has(token)) return true;
  // ASR often outputs close variants: "дама", "дамы", "дамо", "дам"
  return token.startsWith('дам') && token.length >= 3 && token.length <= 5;
};

const detectWakePhrase = (normalized: string): boolean => {
  if (!normalized) return false;
  const tokens = normalized.split(' ').filter(Boolean);
  return tokens.some((token) => looksLikeDamu(token));
};

const SR =
  typeof window !== 'undefined'
    ? ((window as unknown as Record<string, unknown>).SpeechRecognition as typeof SpeechRecognition | undefined) ??
      ((window as unknown as Record<string, unknown>).webkitSpeechRecognition as typeof SpeechRecognition | undefined)
    : undefined;

export const isWakeWordSupported = (): boolean => Boolean(SR);

export class WakeWordDetector {
  private recognition: SpeechRecognition | null = null;
  private running = false;
  private suspended = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private transcriptTail = '';

  constructor(private readonly onWake: () => void) {}

  start(): void {
    if (this.running || !SR) return;
    this.running = true;
    this.suspended = false;
    this.transcriptTail = '';
    this.spawnRecognition();
  }

  suspend(): void {
    this.suspended = true;
    this.transcriptTail = '';
    this.clearRestart();
    try {
      this.recognition?.stop();
    } catch {
      // ignore
    }
    this.recognition = null;
  }

  resume(): void {
    if (!this.running || !this.suspended) return;
    this.suspended = false;
    this.spawnRecognition();
  }

  stop(): void {
    this.running = false;
    this.suspended = false;
    this.transcriptTail = '';
    this.clearRestart();
    try {
      this.recognition?.stop();
    } catch {
      // ignore
    }
    this.recognition = null;
  }

  private clearRestart(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private appendTail(fragment: string): string {
    const next = `${this.transcriptTail} ${fragment}`.trim();
    const words = next.split(' ').filter(Boolean);
    this.transcriptTail = words.slice(-8).join(' ');
    return this.transcriptTail;
  }

  private spawnRecognition(): void {
    if (!SR || !this.running || this.suspended) return;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'ru-RU';
    rec.maxAlternatives = 2;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      if (this.suspended) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        for (let j = 0; j < result.length; j++) {
          const normalized = normalizeWake(result[j]?.transcript ?? '');
          const withTail = this.appendTail(normalized);
          if (detectWakePhrase(normalized) || detectWakePhrase(withTail)) {
            this.transcriptTail = '';
            this.onWake();
            return;
          }
        }
      }
    };

    rec.onend = () => {
      if (!this.running || this.suspended) return;
      // Auto-restart to keep listening continuously
      this.clearRestart();
      this.restartTimer = setTimeout(() => {
        this.recognition = null;
        this.spawnRecognition();
      }, 300);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'audio-capture' are harmless — just restart
      if (event.error === 'aborted') return;
      if (!this.running || this.suspended) return;
      this.clearRestart();
      this.restartTimer = setTimeout(() => {
        this.recognition = null;
        this.spawnRecognition();
      }, 1000);
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch {
      // Already started or permission denied — retry later
      this.restartTimer = setTimeout(() => {
        this.recognition = null;
        this.spawnRecognition();
      }, 2000);
    }
  }
}
