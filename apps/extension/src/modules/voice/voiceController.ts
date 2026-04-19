import { translateByLocale, type AppLocale, type UIStatus } from '@hackathon/shared';

import { OPENAI_API_KEY, OPENAI_TIMEOUT_MS } from '../../constants/api';

type VoiceCallbacks = {
  onStatusChange: (status: UIStatus) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (message: string) => void;
};

const SILENCE_RMS_THRESHOLD = 8;
const SILENCE_DURATION_MS = 2500;
const MIN_RECORDING_MS = 800;
const DUPLICATE_TRANSCRIPT_WINDOW_MS = 20_000;

// Keep prompt minimal so STT does not echo a long instruction template.
const WHISPER_PROMPT = 'Transcribe only what the user says.';
const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const TEMPLATE_ECHO_MARKERS = [
  'медицинская система',
  'команды',
  'открой медицинские записи',
  'открой дневник',
  'заполни жалобы',
  'сформируй расписание',
  'сохрани',
  'medical system',
  'commands',
  'open medical records',
  'open diary',
  'generate schedule',
];
const SERVICE_PAYLOAD_TOKENS = ['context', 'commands', 'intent', 'target', 'confidence', 'source', 'payload', 'json'];

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[.,!?;:"'()«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isTemplateEcho = (value: string): boolean => {
  const normalized = normalizeText(value);
  if (!normalized) return false;

  const markerCount = TEMPLATE_ECHO_MARKERS.reduce((count, marker) => {
    return normalized.includes(marker) ? count + 1 : count;
  }, 0);

  return markerCount >= 3;
};

const isServicePayloadEcho = (value: string): boolean => {
  const normalized = normalizeText(value);
  if (!normalized) return false;

  if (/^"?[a-z_]+"?\s*:?\s*$/i.test(value.trim())) {
    const token = normalized.replace(/"/g, '').replace(/:/g, '').trim();
    return SERVICE_PAYLOAD_TOKENS.includes(token);
  }

  if (value.includes('{"') || value.includes('"intent"') || value.includes('"commands"')) {
    return true;
  }

  const words = normalized.split(' ').filter(Boolean);
  if (words.length <= 3) {
    return words.some((word) => SERVICE_PAYLOAD_TOKENS.includes(word));
  }

  return false;
};

export class VoiceController {
  private locale: AppLocale = 'ru';
  private active = false;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private animFrame: number | null = null;
  private recordingStartMs = 0;
  private lastFinalNormalized = '';
  private lastFinalAt = 0;
  private skipTranscription = false;

  constructor(private readonly callbacks: VoiceCallbacks) {}

  initialize(): void {
    // Keep lazy setup: microphone permission is requested only from user gesture in start().
  }

  setLocale(locale: AppLocale): void {
    this.locale = locale;
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.skipTranscription = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.callbacks.onError('Microphone is unavailable in this context.');
      this.active = false;
      return;
    }

    this.stream = await this.requestMicrophoneAccess(true);
    if (!this.stream) {
      this.active = false;
      return;
    }

    this.chunks = [];
    this.recordingStartMs = Date.now();
    this.callbacks.onStatusChange('listening');
    this.callbacks.onTranscript('', false);

    this.audioCtx = new AudioContext();
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    const analyser = this.audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const checkSilence = () => {
      if (!this.active) return;
      analyser.getByteTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) ** 2, 0) / data.length);
      if (rms < SILENCE_RMS_THRESHOLD) {
        this.silenceTimer ??= setTimeout(() => this.stop(), SILENCE_DURATION_MS);
      } else {
        this.clearSilenceTimer();
      }
      this.animFrame = requestAnimationFrame(checkSilence);
    };
    this.animFrame = requestAnimationFrame(checkSilence);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => void this.transcribe();
    this.mediaRecorder.start(200);
  }

  private async requestMicrophoneAccess(reportError: boolean): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
    } catch (err) {
      if (reportError) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          this.handleMicrophoneDenied();
        } else {
          const msg =
            name === 'NotFoundError'
              ? 'Microphone not found. Connect a microphone and try again.'
              : `Microphone error: ${err instanceof Error ? err.message : String(err)}`;
          this.callbacks.onError(msg);
        }
      }
      return null;
    }
  }

  private getMicrophoneSettingsUrl(): string {
    return navigator.userAgent.includes('Edg/')
      ? 'edge://settings/content/microphone'
      : 'chrome://settings/content/microphone';
  }

  private handleMicrophoneDenied(): void {
    this.callbacks.onError(
      `Microphone access is denied. Allow access in ${this.getMicrophoneSettingsUrl()} and Windows microphone privacy settings, then retry.`,
    );
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.clearSilenceTimer();
    if (this.animFrame !== null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.audioCtx?.close();
    this.audioCtx = null;
    if (this.mediaRecorder?.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  cancel(): void {
    this.skipTranscription = true;
    this.chunks = [];
    this.callbacks.onTranscript('', false);
    this.callbacks.onStatusChange('idle');
    this.stop();
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private shouldSkipTranscript(text: string): boolean {
    const normalized = normalizeText(text);
    if (!normalized || normalized.length < 2) {
      return true;
    }

    if (isTemplateEcho(normalized)) {
      return true;
    }

    if (isServicePayloadEcho(text)) {
      return true;
    }

    const now = Date.now();
    if (normalized === this.lastFinalNormalized && now - this.lastFinalAt < DUPLICATE_TRANSCRIPT_WINDOW_MS) {
      return true;
    }

    this.lastFinalNormalized = normalized;
    this.lastFinalAt = now;
    return false;
  }

  private async transcribe(): Promise<void> {
    if (this.skipTranscription) {
      this.skipTranscription = false;
      this.callbacks.onStatusChange('idle');
      return;
    }

    const durationMs = Date.now() - this.recordingStartMs;
    if (this.chunks.length === 0 || durationMs < MIN_RECORDING_MS) {
      this.callbacks.onStatusChange('idle');
      return;
    }

    this.callbacks.onStatusChange('processing');

    const blob = new Blob(this.chunks, { type: 'audio/webm' });
    const form = new FormData();
    form.append('file', blob, 'audio.webm');
    form.append('model', 'gpt-4o-transcribe');
    form.append('language', this.toWhisperLang(this.locale));
    form.append('response_format', 'json');
    form.append('prompt', WHISPER_PROMPT);

    try {
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`STT ${res.status}: ${errText}`);
      }

      const json = (await res.json()) as { text?: string };
      const text = json.text?.trim() ?? '';
      if (text && !this.shouldSkipTranscript(text)) {
        this.callbacks.onTranscript(text, true);
      }
    } catch (err) {
      this.callbacks.onError(
        translateByLocale(this.locale, 'voice.recognitionFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      this.callbacks.onStatusChange('error');
      // Do not stay in "error" forever, otherwise wake-word listener remains suspended.
      setTimeout(() => this.callbacks.onStatusChange('idle'), 1200);
      return;
    }

    this.callbacks.onStatusChange('idle');
  }

  private toWhisperLang(locale: AppLocale): string {
    if (locale === 'kk') return 'kk';
    if (locale === 'en') return 'en';
    return 'ru';
  }
}
