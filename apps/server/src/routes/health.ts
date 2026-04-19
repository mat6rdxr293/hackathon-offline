import type { FastifyInstance } from 'fastify';

export const registerHealthRoutes = (app: FastifyInstance): void => {
  app.get('/api/health', async () => ({ status: 'ok', now: new Date().toISOString() }));
};
