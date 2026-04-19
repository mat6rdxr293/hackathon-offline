import ruMessages from '../locales/ru.json';
import type { AppLocale } from '../types/locale';

export type TranslationKey = keyof typeof ruMessages;
export type TranslationParams = Record<string, string | number>;

const messageCatalog: Record<AppLocale, Record<string, string>> = {
  ru: ruMessages,
};

export const interpolateMessage = (template: string, params?: TranslationParams): string => {
  if (!params) return template;
  return Object.entries(params).reduce(
    (accumulator, [key, value]) => accumulator.replaceAll(`{${key}}`, String(value)),
    template,
  );
};

export const translateByLocale = (
  locale: AppLocale,
  key: TranslationKey | string,
  params?: TranslationParams,
): string => {
  const localizedTemplate = messageCatalog[locale]?.[key] ?? messageCatalog.ru[key] ?? key;
  return interpolateMessage(localizedTemplate, params);
};

export const getLocaleMessages = (locale: AppLocale): Record<string, string> => messageCatalog[locale];
