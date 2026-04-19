import { z } from 'zod';

import { navigationTargetSchema } from './navigation';

export const intentTypeSchema = z.enum([
  'navigate',
  'fill_primary_exam',
  'fill_discharge_summary',
  'fill_diary',
  'generate_schedule',
  'complete_service',
  'open_diary',
  'generate_document',
  'unknown',
]);

export const parsedIntentSchema = z.object({
  intent: intentTypeSchema,
  target: navigationTargetSchema.optional(),
  confidence: z.number().min(0).max(1),
  normalizedText: z.string(),
  source: z.enum(['keyword', 'provider', 'fallback']),
});

export type ParsedIntentSchema = z.infer<typeof parsedIntentSchema>;
