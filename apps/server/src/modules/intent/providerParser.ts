import { parsedIntentSchema, type ParsedIntent } from '@hackathon/shared';

import { llmProvider } from '../../providers/llm/llmProvider';

export const providerParseIntent = async (normalizedText: string): Promise<ParsedIntent | null> => {
  const candidate = await llmProvider.parseIntent(normalizedText);
  if (!candidate) {
    return null;
  }

  const parsed = parsedIntentSchema.safeParse({
    ...candidate,
    normalizedText,
    source: 'provider',
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};
