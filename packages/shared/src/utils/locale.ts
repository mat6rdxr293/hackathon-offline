import { DEFAULT_LOCALE } from '../constants/locale';
import type { AppLocale } from '../types/locale';

export const parseAppLocale = (_value: unknown): AppLocale => DEFAULT_LOCALE;
