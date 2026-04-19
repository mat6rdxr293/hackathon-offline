export const BACKEND_URL = 'http://127.0.0.1:8788';

export const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? '';

export const OPENAI_TIMEOUT_MS = 60_000;

export const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY ?? '';
// Fixed Russian-friendly ElevenLabs voice to avoid random accent switching.
export const ELEVENLABS_TTS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
// Leave empty: explicit voice ID above has priority.
export const ELEVENLABS_TTS_VOICE_NAME = '';
export const ELEVENLABS_TTS_MODEL_ID = 'eleven_multilingual_v2';
export const ELEVENLABS_TTS_OUTPUT_FORMAT = 'mp3_44100_128';

// Tuned to match the screenshot settings (slow speed, high stability/similarity, moderate style).
export const ELEVENLABS_TTS_SPEED = 0.8;
export const ELEVENLABS_TTS_STABILITY = 0.95;
export const ELEVENLABS_TTS_SIMILARITY_BOOST = 1.0;
export const ELEVENLABS_TTS_STYLE = 0.35;
export const ELEVENLABS_TTS_USE_SPEAKER_BOOST = true;
