import type { FastifyRequest } from 'fastify';

import { DEFAULT_LOCALE, parseAppLocale, type AppLocale } from '@hackathon/shared';

export const getRequestLocale = (request: FastifyRequest, bodyLocale?: unknown): AppLocale => {
  if (bodyLocale) {
    return parseAppLocale(bodyLocale);
  }

  const headerLocale = request.headers['x-locale'];
  if (typeof headerLocale === 'string') {
    return parseAppLocale(headerLocale);
  }

  const acceptLanguage = request.headers['accept-language'];
  if (typeof acceptLanguage === 'string') {
    return parseAppLocale(acceptLanguage.split(',')[0] ?? DEFAULT_LOCALE);
  }

  return DEFAULT_LOCALE;
};
