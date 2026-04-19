import type { FastifyInstance } from 'fastify';

import { parseTextRequestSchema } from '../schemas/requests';
import { parseIntent } from '../modules/intent/intentService';

export const registerIntentRoutes = (app: FastifyInstance): void => {
  app.post('/api/intent/parse', async (request, reply) => {
    const payload = parseTextRequestSchema.parse(request.body);
    const parsed = await parseIntent(payload.text);
    return reply.send(parsed);
  });
};
