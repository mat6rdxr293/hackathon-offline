import { z } from 'zod';

export const actionLogTypeSchema = z.enum(['navigate', 'fill', 'schedule', 'complete', 'error']);

export const actionLogItemSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: actionLogTypeSchema,
  title: z.string(),
  details: z.string().optional(),
  success: z.boolean(),
});

export type ActionLogItemSchema = z.infer<typeof actionLogItemSchema>;
