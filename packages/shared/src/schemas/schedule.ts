import { z } from 'zod';

export const procedureTypeSchema = z.enum(['lfk', 'massage', 'physio']);

export const procedureInputSchema = z.object({
  id: z.string().min(1),
  type: procedureTypeSchema,
  title: z.string().min(1),
  specialistId: z.string().min(1),
  durationMinutes: z.number().int().min(30).max(40),
  sessions: z.number().int().min(1),
});

export const specialistAvailabilitySchema = z.object({
  specialistId: z.string().min(1),
  workStart: z.string().regex(/^\d{2}:\d{2}$/),
  workEnd: z.string().regex(/^\d{2}:\d{2}$/),
});

export const busySlotSchema = z.object({
  specialistId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const scheduleGenerationInputSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  procedures: z.array(procedureInputSchema).min(1),
  specialistAvailability: z.array(specialistAvailabilitySchema).min(1),
  busySlots: z.array(busySlotSchema),
  workingDays: z.number().int().min(1).max(30).default(9),
});

export const scheduledItemSchema = z.object({
  procedureId: z.string(),
  procedureTitle: z.string(),
  specialistId: z.string(),
  room: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const scheduleGenerationResultSchema = z.object({
  items: z.array(scheduledItemSchema),
  unplaced: z.array(
    z.object({
      procedureId: z.string(),
      reason: z.string(),
    }),
  ),
  explanation: z.string(),
});

export type ScheduleGenerationInputSchema = z.infer<typeof scheduleGenerationInputSchema>;
export type ScheduleGenerationResultSchema = z.infer<typeof scheduleGenerationResultSchema>;
