import { translateByLocale, type AppLocale, type MedicalData } from '@hackathon/shared';

const SECTION_ALIASES: Record<string, string[]> = {
  complaints: ['жалобы', 'жалоба', 'шағым', 'шағымдар', 'complaints'],
  anamnesis: ['анамнез', 'anamnesis'],
  objectiveStatus: ['объективно', 'объективный статус', 'объективті', 'objective status'],
  recommendations: ['рекомендации', 'назначено', 'рекомендован', 'ұсыныс', 'recommended'],
  notes: ['заметки', 'дополнительно', 'қосымша', 'notes'],
};

const extractSentencesByKeywords = (text: string, keywords: string[]): string => {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const matches = sentences.filter((sentence) => keywords.some((keyword) => sentence.toLowerCase().includes(keyword)));
  return matches.join(' ').trim();
};

export const heuristicParseMedicalText = (sourceText: string, locale: AppLocale = 'ru'): MedicalData => {
  const text = sourceText.trim();

  const complaints = extractSentencesByKeywords(text, SECTION_ALIASES['complaints'] ?? []);
  const anamnesis = extractSentencesByKeywords(text, SECTION_ALIASES['anamnesis'] ?? []);
  const objectiveStatus = extractSentencesByKeywords(text, SECTION_ALIASES['objectiveStatus'] ?? []);
  const recommendations = extractSentencesByKeywords(text, SECTION_ALIASES['recommendations'] ?? []);
  const notes = extractSentencesByKeywords(text, SECTION_ALIASES['notes'] ?? []);

  return {
    complaints: complaints || text,
    anamnesis: anamnesis || translateByLocale(locale, 'medical.fallback.anamnesis'),
    objectiveStatus: objectiveStatus || text,
    recommendations: recommendations || translateByLocale(locale, 'medical.fallback.recommendations'),
    notes: notes.trim(),
  };
};
