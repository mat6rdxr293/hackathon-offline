import { z } from 'zod';

export const uiStatusSchema = z.enum(['idle', 'listening', 'processing', 'executing', 'success', 'error']);

export type UiStatusSchema = z.infer<typeof uiStatusSchema>;
