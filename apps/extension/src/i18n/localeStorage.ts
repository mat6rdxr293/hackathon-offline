import { DEFAULT_LOCALE, parseAppLocale, type AppLocale } from '@hackathon/shared';

export const EXTENSION_LOCALE_KEY = 'medflow_locale';

const getStorageLocal = (): chrome.storage.LocalStorageArea | null => {
  if (typeof chrome === 'undefined') {
    return null;
  }
  return chrome.storage?.local ?? null;
};

export const getStoredLocale = async (): Promise<AppLocale> => {
  try {
    const storage = getStorageLocal();
    if (!storage) {
      return DEFAULT_LOCALE;
    }
    const data = await storage.get(EXTENSION_LOCALE_KEY);
    return parseAppLocale(data[EXTENSION_LOCALE_KEY]);
  } catch {
    return DEFAULT_LOCALE;
  }
};

export const setStoredLocale = async (locale: AppLocale): Promise<void> => {
  const storage = getStorageLocal();
  if (!storage) {
    return;
  }
  await storage.set({ [EXTENSION_LOCALE_KEY]: locale });
};
