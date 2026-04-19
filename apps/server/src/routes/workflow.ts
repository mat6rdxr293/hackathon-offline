import type { FastifyInstance } from 'fastify';

import { advanceWorkflow } from '../modules/workflow/workflowEngine';
import { workflowNextStepRequestSchema } from '../schemas/requests';
import { getRequestLocale } from '../utils/locale';

export const registerWorkflowRoutes = (app: FastifyInstance): void => {
  app.post('/api/workflow/next-step', async (request, reply) => {
    const payload = workflowNextStepRequestSchema.parse(request.body);
    const locale = getRequestLocale(request, payload.locale);
    const result = advanceWorkflow(payload.state, payload.event, locale);
    return reply.send(result);
  });
};
