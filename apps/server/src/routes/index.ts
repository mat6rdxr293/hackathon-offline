import type { FastifyInstance } from 'fastify';

import { registerHealthRoutes } from './health';
import { registerIntentRoutes } from './intent';
import { registerMedicalRoutes } from './medical';
import { registerScheduleRoutes } from './schedule';
import { registerWorkflowRoutes } from './workflow';

export const registerRoutes = (app: FastifyInstance): void => {
  registerHealthRoutes(app);
  registerIntentRoutes(app);
  registerMedicalRoutes(app);
  registerScheduleRoutes(app);
  registerWorkflowRoutes(app);
};
