import type { FastifyInstance } from 'fastify';

import { parseTextRequestSchema } from '../schemas/requests';
import { parseMedicalText } from '../modules/medical/medicalService';
import { getRequestLocale } from '../utils/locale';

export const registerMedicalRoutes = (app: FastifyInstance): void => {
  app.post('/api/medical/parse', async (request, reply) => {
    const payload = parseTextRequestSchema.parse(request.body);
    const locale = getRequestLocale(request, payload.locale);
    const parsed = await parseMedicalText(payload.text, locale);
    return reply.send(parsed);
  });
};
