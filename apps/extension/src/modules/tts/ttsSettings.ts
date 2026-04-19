const TTS_ENABLED_KEY = 'medflow_tts_enabled';

let cachedValue: boolean | null = null;

const getStorage = (): chrome.storage.LocalStorageArea | null => {
  if (typeof chrome === 'undefined') return null;
  return chrome.storage?.local ?? null;
};

export const loadTtsEnabled = async (): Promise<boolean> => {
  if (cachedValue !== null) return cachedValue;

  const storage = getStorage();
  if (!storage) {
    cachedValue = true;
    return true;
  }

  try {
    const payload = await storage.get(TTS_ENABLED_KEY);
    const raw = payload[TTS_ENABLED_KEY];
    const value = typeof raw === 'boolean' ? raw : true;
    cachedValue = value;
    return value;
  } catch {
    cachedValue = true;
    return true;
  }
};

export const saveTtsEnabled = async (enabled: boolean): Promise<void> => {
  cachedValue = enabled;
  const storage = getStorage();
  if (!storage) return;

  try {
    await storage.set({ [TTS_ENABLED_KEY]: enabled });
  } catch {
    // Best effort persistence only.
  }
};

