export const INTENT_TYPES = [
  'navigate',
  'fill_primary_exam',
  'fill_discharge_summary',
  'fill_diary',
  'generate_schedule',
  'complete_service',
  'open_diary',
  'generate_document',
  'unknown',
] as const;

export type IntentType = (typeof INTENT_TYPES)[number];

export type ParsedIntent = {
  intent: IntentType;
  target?: NavigationTarget;
  confidence: number;
  normalizedText: string;
  source: 'keyword' | 'provider' | 'fallback';
};

import type { NavigationTarget } from './navigation';
