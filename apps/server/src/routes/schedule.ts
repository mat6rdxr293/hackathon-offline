import type { FastifyInstance } from 'fastify';

import { scheduleGenerationInputSchema } from '@hackathon/shared';

import { generateSchedule } from '../modules/schedule/scheduleService';
import { getRequestLocale } from '../utils/locale';

export const registerScheduleRoutes = (app: FastifyInstance): void => {
  app.post('/api/schedule/generate', async (request, reply) => {
    const payload = scheduleGenerationInputSchema.parse(request.body);
    const locale = getRequestLocale(request);
    const result = generateSchedule(payload, locale);
    return reply.send(result);
  });
};
