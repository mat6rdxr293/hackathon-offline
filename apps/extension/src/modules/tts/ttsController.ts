import type { AppLocale } from '@hackathon/shared';

import {
  ELEVENLABS_API_KEY,
  ELEVENLABS_TTS_MODEL_ID,
  ELEVENLABS_TTS_OUTPUT_FORMAT,
  ELEVENLABS_TTS_SIMILARITY_BOOST,
  ELEVENLABS_TTS_SPEED,
  ELEVENLABS_TTS_STABILITY,
  ELEVENLABS_TTS_STYLE,
  ELEVENLABS_TTS_USE_SPEAKER_BOOST,
  ELEVENLABS_TTS_VOICE_ID,
  ELEVENLABS_TTS_VOICE_NAME,
  OPENAI_API_KEY,
  OPENAI_TIMEOUT_MS,
} from '../../constants/api';

type TtsLocaleConfig = {
  lang: string;
  baseRate: number;
  basePitch: number;
  preferredVoiceTokens: string[];
  openAiVoice: string;
};

const LOCALE_CONFIG: Record<AppLocale, TtsLocaleConfig> = {
  ru: {
    lang: 'ru-RU',
    baseRate: 0.95,
    basePitch: 1.02,
    preferredVoiceTokens: ['natural', 'neural', 'google', 'microsoft', 'irina', 'pavel', 'svetlana', 'ru-ru'],
    openAiVoice: 'nova',
  },
  kk: {
    lang: 'kk-KZ',
    baseRate: 0.95,
    basePitch: 1.02,
    preferredVoiceTokens: ['natural', 'neural', 'google', 'microsoft', 'kk-kz', 'kazakh'],
    openAiVoice: 'alloy',
  },
  en: {
    lang: 'en-US',
    baseRate: 0.98,
    basePitch: 1.0,
    preferredVoiceTokens: ['natural', 'neural', 'google', 'microsoft', 'en-us', 'en-gb'],
    openAiVoice: 'nova',
  },
};

const UNSAFE_VOICE_TOKENS = ['espeak', 'robot', 'sapi', 'sam'];
const MAX_CHUNK_LEN = 220;

const normalizeText = (text: string): string => {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  return /[.!?…:]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const splitIntoChunks = (text: string): string[] => {
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= MAX_CHUNK_LEN) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (sentence.length <= MAX_CHUNK_LEN) {
      current = sentence;
      continue;
    }

    for (let index = 0; index < sentence.length; index += MAX_CHUNK_LEN) {
      chunks.push(sentence.slice(index, index + MAX_CHUNK_LEN));
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const looksLikeApiKey = (value: string): boolean => value.trim().startsWith('sk-');
const looksLikeElevenApiKey = (value: string): boolean => value.trim().length >= 20;

const getOpenAiLanguageHint = (locale: AppLocale): string => {
  if (locale === 'kk') return 'Kazakh';
  if (locale === 'en') return 'English';
  return 'Russian';
};

const normalizedVoiceName = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

type ElevenVoice = {
  voice_id?: string;
  name?: string;
  description?: string;
  category?: string;
  labels?: Record<string, unknown>;
};

const toElevenLanguageCode = (locale: AppLocale): 'ru' | 'kk' | 'en' => {
  if (locale === 'kk') return 'kk';
  if (locale === 'en') return 'en';
  return 'ru';
};

const buildElevenVoiceSearchText = (voice: ElevenVoice): string => {
  const labels = voice.labels ? Object.values(voice.labels).map((value) => String(value ?? '')) : [];
  return normalizedVoiceName(
    [voice.name, voice.description, voice.category, ...labels]
      .filter((value): value is string => Boolean(value))
      .join(' '),
  );
};

const scoreElevenVoice = (voice: ElevenVoice, locale: AppLocale, targetName: string): number => {
  const name = normalizedVoiceName(voice.name ?? '');
  const blob = buildElevenVoiceSearchText(voice);
  let score = 0;

  if (targetName && name === targetName) {
    score += 90;
  }

  if (locale === 'ru') {
    if (/[а-яё]/i.test(voice.name ?? '')) score += 45;
    if (blob.includes('russian') || blob.includes('рус')) score += 120;
    if (blob.includes('ru-ru') || /\bru\b/.test(blob)) score += 35;
    if (blob.includes('english') || blob.includes('en-us') || blob.includes('en-gb')) score -= 45;
    if (blob.includes('polish') || /\bpl\b/.test(blob)) score -= 140;
  } else if (locale === 'kk') {
    if (blob.includes('kazakh') || blob.includes('қазақ')) score += 120;
    if (blob.includes('kk-kz') || /\bkk\b/.test(blob)) score += 35;
  } else {
    if (blob.includes('english') || blob.includes('en-us') || blob.includes('en-gb')) score += 90;
  }

  if (blob.includes('multilingual')) score += 12;
  if (!voice.name) score -= 10;

  return score;
};

class TTSController {
  private speaking = false;
  private enabled = true;
  private speechToken = 0;
  private selectedVoiceByLocale = new Map<AppLocale, SpeechSynthesisVoice | null>();
  private activeAudio: HTMLAudioElement | null = null;
  private activeAudioUrl: string | null = null;
  private elevenVoiceIdByLocale = new Map<AppLocale, string | null>();
  private elevenVoicesCache: ElevenVoice[] | null = null;
  private elevenVoiceLookupAttempted = false;

  private isTokenActive(token: number): boolean {
    return token === this.speechToken;
  }

  speak(text: string, locale: AppLocale = 'ru'): void {
    if (!this.enabled) return;
    const normalized = normalizeText(text);
    if (!normalized) return;

    const token = ++this.speechToken;
    this.stop();
    this.speechToken = token;

    void this.speakInternal(normalized, locale, token);
  }

  stop(): void {
    this.speechToken += 1;
    this.speaking = false;

    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.src = '';
      this.activeAudio = null;
    }

    if (this.activeAudioUrl) {
      URL.revokeObjectURL(this.activeAudioUrl);
      this.activeAudioUrl = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) {
      this.stop();
    }
  }

  private async speakInternal(text: string, locale: AppLocale, token: number): Promise<void> {
    const elevenOk = await this.trySpeakWithElevenLabs(text, locale, token);
    if (elevenOk) return;

    const openAiOk = await this.trySpeakWithOpenAi(text, locale, token);
    if (openAiOk) return;

    if (!this.isTokenActive(token)) return;
    this.speakWithWebSpeech(text, locale, token);
  }

  private async resolveElevenVoiceId(locale: AppLocale): Promise<string | null> {
    if (this.elevenVoiceIdByLocale.has(locale)) {
      return this.elevenVoiceIdByLocale.get(locale) ?? null;
    }

    const explicitVoiceId = ELEVENLABS_TTS_VOICE_ID.trim();
    if (explicitVoiceId) {
      this.elevenVoiceIdByLocale.set(locale, explicitVoiceId);
      return explicitVoiceId;
    }

    if (!looksLikeElevenApiKey(ELEVENLABS_API_KEY)) {
      this.elevenVoiceIdByLocale.set(locale, null);
      return null;
    }

    let voices = this.elevenVoicesCache;
    if (!voices) {
      if (this.elevenVoiceLookupAttempted) {
        this.elevenVoiceIdByLocale.set(locale, null);
        return null;
      }

      this.elevenVoiceLookupAttempted = true;

      try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
          method: 'GET',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
          },
          signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
        });

        if (!response.ok) {
          this.elevenVoiceIdByLocale.set(locale, null);
          return null;
        }

        const payload = (await response.json()) as { voices?: ElevenVoice[] };
        voices = payload.voices ?? [];
        this.elevenVoicesCache = voices;
      } catch {
        this.elevenVoiceIdByLocale.set(locale, null);
        return null;
      }
    }

    if (!voices || voices.length === 0) {
      this.elevenVoiceIdByLocale.set(locale, null);
      return null;
    }

    const targetName = normalizedVoiceName(ELEVENLABS_TTS_VOICE_NAME);
    const exact = targetName
      ? voices.find((voice) => normalizedVoiceName(voice.name ?? '') === targetName)
      : null;
    const scored = voices
      .map((voice) => ({ voice, score: scoreElevenVoice(voice, locale, targetName) }))
      .sort((left, right) => right.score - left.score);
    const bestByLocale = scored[0]?.score >= 10 ? scored[0]?.voice : null;
    const alanFallback = locale === 'en'
      ? voices.find((voice) => normalizedVoiceName(voice.name ?? '').includes('alan'))
      : null;
    const first = voices[0];

    const selected = bestByLocale ?? exact ?? alanFallback ?? first;
    const voiceId = selected?.voice_id?.trim() || null;
    this.elevenVoiceIdByLocale.set(locale, voiceId);
    return voiceId;
  }

  private async trySpeakWithElevenLabs(text: string, locale: AppLocale, token: number): Promise<boolean> {
    if (!looksLikeElevenApiKey(ELEVENLABS_API_KEY)) {
      return false;
    }

    const voiceId = await this.resolveElevenVoiceId(locale);
    if (!voiceId || !this.isTokenActive(token)) {
      return false;
    }

    try {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(ELEVENLABS_TTS_OUTPUT_FORMAT)}`;
      const requestPayload = (withLanguageCode: boolean) => ({
        text,
        model_id: ELEVENLABS_TTS_MODEL_ID,
        ...(withLanguageCode ? { language_code: toElevenLanguageCode(locale) } : {}),
        voice_settings: {
          speed: ELEVENLABS_TTS_SPEED,
          stability: ELEVENLABS_TTS_STABILITY,
          similarity_boost: ELEVENLABS_TTS_SIMILARITY_BOOST,
          style: ELEVENLABS_TTS_STYLE,
          use_speaker_boost: ELEVENLABS_TTS_USE_SPEAKER_BOOST,
        },
      });

      const request = async (withLanguageCode: boolean) => fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(requestPayload(withLanguageCode)),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });

      let response = await request(true);
      if (!response.ok && response.status === 400) {
        response = await request(false);
      }

      if (!response.ok || !this.isTokenActive(token)) {
        return false;
      }

      const audioBlob = await response.blob();
      if (!this.isTokenActive(token)) {
        return false;
      }

      const objectUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(objectUrl);
      audio.preload = 'auto';
      audio.playbackRate = 1;

      this.activeAudioUrl = objectUrl;
      this.activeAudio = audio;
      this.speaking = true;

      const clearAudio = () => {
        this.speaking = false;

        if (this.activeAudio) {
          this.activeAudio.src = '';
          this.activeAudio = null;
        }

        if (this.activeAudioUrl) {
          URL.revokeObjectURL(this.activeAudioUrl);
          this.activeAudioUrl = null;
        }
      };

      audio.onended = clearAudio;
      audio.onerror = clearAudio;

      await audio.play();
      return true;
    } catch {
      this.speaking = false;
      if (this.activeAudio) {
        this.activeAudio.pause();
        this.activeAudio.src = '';
        this.activeAudio = null;
      }
      if (this.activeAudioUrl) {
        URL.revokeObjectURL(this.activeAudioUrl);
        this.activeAudioUrl = null;
      }
      return false;
    }
  }

  private async trySpeakWithOpenAi(text: string, locale: AppLocale, token: number): Promise<boolean> {
    if (!looksLikeApiKey(OPENAI_API_KEY)) {
      return false;
    }

    const config = LOCALE_CONFIG[locale] ?? LOCALE_CONFIG.ru;

    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice: config.openAiVoice,
          format: 'mp3',
          input: `[${getOpenAiLanguageHint(locale)}] ${text}`,
        }),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });

      if (!response.ok || !this.isTokenActive(token)) {
        return false;
      }

      const audioBlob = await response.blob();
      if (!this.isTokenActive(token)) {
        return false;
      }

      const objectUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(objectUrl);
      audio.preload = 'auto';
      audio.playbackRate = 1;

      this.activeAudioUrl = objectUrl;
      this.activeAudio = audio;
      this.speaking = true;

      const clearAudio = () => {
        this.speaking = false;

        if (this.activeAudio) {
          this.activeAudio.src = '';
          this.activeAudio = null;
        }

        if (this.activeAudioUrl) {
          URL.revokeObjectURL(this.activeAudioUrl);
          this.activeAudioUrl = null;
        }
      };

      audio.onended = clearAudio;
      audio.onerror = clearAudio;

      await audio.play();
      return true;
    } catch {
      this.speaking = false;
      if (this.activeAudio) {
        this.activeAudio.pause();
        this.activeAudio.src = '';
        this.activeAudio = null;
      }
      if (this.activeAudioUrl) {
        URL.revokeObjectURL(this.activeAudioUrl);
        this.activeAudioUrl = null;
      }
      return false;
    }
  }

  private speakWithWebSpeech(text: string, locale: AppLocale, token: number): void {
    if (!window.speechSynthesis || !this.isTokenActive(token)) {
      return;
    }

    const config = LOCALE_CONFIG[locale] ?? LOCALE_CONFIG.ru;
    const chunks = splitIntoChunks(text);

    this.selectBestVoice(locale, config)
      .then((voice) => {
        if (!this.isTokenActive(token)) {
          return;
        }

        let remaining = chunks.length;
        this.speaking = true;

        chunks.forEach((chunk, index) => {
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = config.lang;
          if (voice) utterance.voice = voice;

          const prosodyShift = index % 3 === 0 ? 0 : index % 3 === 1 ? 0.02 : -0.015;
          utterance.rate = clamp(config.baseRate + prosodyShift, 0.86, 1.12);
          utterance.pitch = clamp(config.basePitch + prosodyShift * 0.4, 0.9, 1.2);
          utterance.volume = 1;

          utterance.onend = () => {
            remaining -= 1;
            if (remaining <= 0 && this.isTokenActive(token)) {
              this.speaking = false;
            }
          };

          utterance.onerror = () => {
            this.speaking = false;
          };

          window.speechSynthesis.speak(utterance);
        });
      })
      .catch(() => {
        this.speaking = false;
      });
  }

  private async selectBestVoice(locale: AppLocale, config: TtsLocaleConfig): Promise<SpeechSynthesisVoice | null> {
    if (!window.speechSynthesis) return null;

    if (this.selectedVoiceByLocale.has(locale)) {
      return this.selectedVoiceByLocale.get(locale) ?? null;
    }

    const voices = await this.getVoices();
    if (voices.length === 0) {
      this.selectedVoiceByLocale.set(locale, null);
      return null;
    }

    const localeKey = config.lang.toLowerCase();
    const best = voices
      .map((voice) => ({ voice, score: this.scoreVoice(voice, localeKey, config.preferredVoiceTokens) }))
      .sort((left, right) => right.score - left.score)[0]?.voice ?? null;

    this.selectedVoiceByLocale.set(locale, best);
    return best;
  }

  private scoreVoice(voice: SpeechSynthesisVoice, localeKey: string, preferredTokens: string[]): number {
    const normalizedName = `${voice.name} ${voice.voiceURI}`.toLowerCase();
    const lang = (voice.lang || '').toLowerCase();
    const langPrefix = localeKey.split('-')[0] ?? localeKey;

    let score = 0;

    if (lang === localeKey) score += 80;
    else if (langPrefix && lang.startsWith(langPrefix)) score += 45;

    for (const token of preferredTokens) {
      if (normalizedName.includes(token)) score += 18;
    }

    if (!voice.localService) score += 8;
    if (voice.default) score += 4;

    for (const badToken of UNSAFE_VOICE_TOKENS) {
      if (normalizedName.includes(badToken)) score -= 60;
    }

    return score;
  }

  private async getVoices(): Promise<SpeechSynthesisVoice[]> {
    if (!window.speechSynthesis) return [];

    const direct = window.speechSynthesis.getVoices();
    if (direct.length > 0) return direct;

    return new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        window.speechSynthesis.onvoiceschanged = null;
        resolve(window.speechSynthesis.getVoices());
      }, 1200);

      window.speechSynthesis.onvoiceschanged = () => {
        window.clearTimeout(timeoutId);
        window.speechSynthesis.onvoiceschanged = null;
        resolve(window.speechSynthesis.getVoices());
      };
    });
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  get isAvailable(): boolean {
    return (
      typeof window !== 'undefined' &&
      ('speechSynthesis' in window || looksLikeElevenApiKey(ELEVENLABS_API_KEY) || looksLikeApiKey(OPENAI_API_KEY))
    );
  }

  get isEnabled(): boolean {
    return this.enabled;
  }
}

export const ttsController = new TTSController();
