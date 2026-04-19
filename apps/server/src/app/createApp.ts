import Fastify from 'fastify';
import cors from '@fastify/cors';

import { registerRoutes } from '../routes';

export const createApp = async () => {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
  });

  registerRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    reply.status(400).send({
      message: 'Request failed',
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return app;
};
