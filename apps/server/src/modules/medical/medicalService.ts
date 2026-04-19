import { medicalDataSchema, type AppLocale, type MedicalData, type MedicalParseResult } from '@hackathon/shared';

import { heuristicParseMedicalText } from './heuristicParser';
import { providerEnhanceMedical } from './llmEnhancer';

const normalizeField = (value: string): string => value.trim().replace(/\s+/g, ' ');

const normalizeMedicalData = (data: MedicalData): MedicalData => ({
  complaints: normalizeField(data.complaints),
  anamnesis: normalizeField(data.anamnesis),
  objectiveStatus: normalizeField(data.objectiveStatus),
  recommendations: normalizeField(data.recommendations),
  notes: normalizeField(data.notes),
});

export const parseMedicalText = async (text: string, locale: AppLocale = 'ru'): Promise<MedicalParseResult> => {
  const heuristic = heuristicParseMedicalText(text, locale);
  const enhanced = await providerEnhanceMedical(text, heuristic);

  const merged: MedicalData = {
    complaints: enhanced?.complaints || heuristic.complaints,
    anamnesis: enhanced?.anamnesis || heuristic.anamnesis,
    objectiveStatus: enhanced?.objectiveStatus || heuristic.objectiveStatus,
    recommendations: enhanced?.recommendations || heuristic.recommendations,
    notes: enhanced?.notes || heuristic.notes,
  };

  const normalized = normalizeMedicalData(merged);
  const validated = medicalDataSchema.parse(normalized);

  return {
    data: validated,
    confidence: enhanced ? 0.9 : 0.75,
    source: enhanced ? 'hybrid' : 'heuristic',
  };
};
