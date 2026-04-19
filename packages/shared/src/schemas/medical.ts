import { z } from 'zod';

export const medicalDataSchema = z.object({
  complaints: z.string(),
  anamnesis: z.string(),
  objectiveStatus: z.string(),
  recommendations: z.string(),
  notes: z.string(),
  registrationDate: z.string().optional(),
  recordType: z.string().optional(),
});

export const medicalParseResultSchema = z.object({
  data: medicalDataSchema,
  confidence: z.number().min(0).max(1),
  source: z.enum(['heuristic', 'provider', 'hybrid']),
});

export type MedicalDataSchema = z.infer<typeof medicalDataSchema>;
export type MedicalParseResultSchema = z.infer<typeof medicalParseResultSchema>;
