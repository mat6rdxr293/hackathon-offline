import { z } from 'zod';

export const workflowStateSchema = z.enum([
  'idle',
  'patient_opened',
  'primary_exam_opened',
  'primary_exam_filled',
  'schedule_ready',
  'service_completed',
  'diary_updated',
]);

export const workflowEventSchema = z.enum([
  'patient_opened',
  'primary_exam_opened',
  'primary_exam_filled',
  'schedule_generated',
  'service_completed',
  'diary_updated',
  'reset',
]);

export const workflowNextStepSchema = z.object({
  nextRecommendedAction: z.enum(['navigate', 'fill_primary_exam', 'generate_schedule', 'complete_service', 'open_diary']),
  message: z.string(),
});

export type WorkflowStateSchema = z.infer<typeof workflowStateSchema>;
export type WorkflowNextStepSchema = z.infer<typeof workflowNextStepSchema>;
