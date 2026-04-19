import { z } from 'zod';

export const navigationTargetSchema = z.enum([
  'patients_list',
  'patient_page',
  'primary_exam',
  'discharge_summary',
  'treatment_diary',
  'procedures',
  'schedule_block',
]);

export type NavigationTargetSchema = z.infer<typeof navigationTargetSchema>;
