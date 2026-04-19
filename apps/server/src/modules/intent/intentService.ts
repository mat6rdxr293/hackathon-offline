import { normalizeCommandText, type NavigationTarget, type ParsedIntent } from '@hackathon/shared';

import { keywordParseIntent } from './keywordParser';
import { providerParseIntent } from './providerParser';

export const parseIntent = async (text: string): Promise<ParsedIntent> => {
  const normalizedText = normalizeCommandText(text);

  const keywordResult = keywordParseIntent(normalizedText);
  if (keywordResult.intent !== 'unknown') {
    return keywordResult;
  }

  const providerResult = await providerParseIntent(normalizedText);
  if (providerResult) {
    return providerResult;
  }

  return {
    intent: 'unknown',
    confidence: 0.3,
    normalizedText,
    source: 'fallback',
  };
};

export const toNavigateResult = (normalizedText: string, target: NavigationTarget, confidence = 0.85): ParsedIntent => ({
  intent: 'navigate',
  target,
  confidence,
  normalizedText,
  source: 'keyword',
});
