import { medicalDataSchema, type MedicalData } from '@hackathon/shared';

import { llmProvider } from '../../providers/llm/llmProvider';

export const providerEnhanceMedical = async (text: string, fallback: MedicalData): Promise<MedicalData | null> => {
  const candidate = await llmProvider.parseMedical(text, fallback);
  if (!candidate) {
    return null;
  }

  const parsed = medicalDataSchema.safeParse(candidate);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};
