import type { FastifyBaseLogger } from 'fastify';

export const logError = (logger: FastifyBaseLogger, message: string, error: unknown): void => {
  logger.error({ err: error }, message);
};
