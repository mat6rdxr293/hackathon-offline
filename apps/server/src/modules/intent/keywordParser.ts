import { TARGET_SYNONYMS, type ParsedIntent } from '@hackathon/shared';

import { toNavigateResult } from './intentService';

const FILL_KEYWORDS = ['заполни', 'заполнить', 'диктовка', 'осмотр', 'толтыр', 'тексеру', 'fill', 'primary exam'];

const SCHEDULE_KEYWORDS = ['расписание', 'график', 'процедур', 'кесте', 'schedule'];
const COMPLETE_KEYWORDS = [
  'выполнено',
  'выполнен',
  'выполненную',
  'отметь выполненным',
  'заверши услугу',
  'орындалды',
  'қызмет',
  'complete service',
  'completed',
];
const DIARY_KEYWORDS = ['дневник', 'открой дневник', 'күнделік', 'open diary', 'open treatment diary'];
const DOCUMENT_KEYWORDS = ['итоговый лист', 'сформируй документ', 'скачай документ', 'сгенерируй документ', 'сгенерируй выписку', 'generate document', 'download document', 'құжат жасақта'];

export const keywordParseIntent = (normalizedText: string): ParsedIntent => {
  if (FILL_KEYWORDS.some((keyword) => normalizedText.includes(keyword))) {
    return {
      intent: 'fill_primary_exam',
      target: 'primary_exam',
      confidence: 0.83,
      normalizedText,
      source: 'keyword',
    };
  }

  if (SCHEDULE_KEYWORDS.some((keyword) => normalizedText.includes(keyword))) {
    return {
      intent: 'generate_schedule',
      confidence: 0.86,
      normalizedText,
      source: 'keyword',
    };
  }

  if (COMPLETE_KEYWORDS.some((keyword) => normalizedText.includes(keyword))) {
    return {
      intent: 'complete_service',
      confidence: 0.84,
      normalizedText,
      source: 'keyword',
    };
  }

  if (DIARY_KEYWORDS.some((keyword) => normalizedText.includes(keyword))) {
    return {
      intent: 'open_diary',
      target: 'treatment_diary',
      confidence: 0.82,
      normalizedText,
      source: 'keyword',
    };
  }

  if (DOCUMENT_KEYWORDS.some((keyword) => normalizedText.includes(keyword))) {
    return {
      intent: 'generate_document',
      confidence: 0.88,
      normalizedText,
      source: 'keyword',
    };
  }

  for (const [target, synonyms] of Object.entries(TARGET_SYNONYMS)) {
    if (synonyms.some((token) => normalizedText.includes(token))) {
      return toNavigateResult(normalizedText, target as keyof typeof TARGET_SYNONYMS);
    }
  }

  return {
    intent: 'unknown',
    confidence: 0.2,
    normalizedText,
    source: 'keyword',
  };
};
