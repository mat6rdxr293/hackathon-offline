export const APP_LOCALES = ['ru'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];
