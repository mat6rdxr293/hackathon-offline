import { appLocaleSchema } from '@hackathon/shared';
import { z } from 'zod';

export const parseTextRequestSchema = z.object({
  text: z.string().min(1),
  locale: appLocaleSchema.optional(),
});

export const workflowNextStepRequestSchema = z.object({
  state: z.enum([
    'idle',
    'patient_opened',
    'primary_exam_opened',
    'primary_exam_filled',
    'schedule_ready',
    'service_completed',
    'diary_updated',
  ]),
  event: z
    .enum([
      'patient_opened',
      'primary_exam_opened',
      'primary_exam_filled',
      'schedule_generated',
      'service_completed',
      'diary_updated',
      'reset',
    ])
    .optional(),
  locale: appLocaleSchema.optional(),
});
