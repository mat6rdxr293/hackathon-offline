import { readEnv } from '../../config/env';

const env = readEnv();

type ProviderIntentResult = {
  intent: 'navigate' | 'fill_primary_exam' | 'generate_schedule' | 'complete_service' | 'open_diary' | 'unknown';
  target?: string;
  confidence: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const callProvider = async (prompt: string): Promise<string | null> => {
  if (!env.LLM_API_KEY) {
    return null;
  }

  const response = await fetch(env.LLM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON object. No markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as ChatCompletionResponse;
  return json.choices?.[0]?.message?.content?.trim() ?? null;
};

const safeParseJson = <T>(raw: string | null): T | null => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const llmProvider = {
  async parseIntent(text: string): Promise<ProviderIntentResult | null> {
    const prompt = `Classify medical assistant command into one intent: navigate, fill_primary_exam, generate_schedule, complete_service, open_diary, unknown. Input: "${text}". Return JSON with intent, optional target, confidence.`;
    return safeParseJson<ProviderIntentResult>(await callProvider(prompt));
  },

  async parseMedical(
    text: string,
    fallback: {
      complaints: string;
      anamnesis: string;
      objectiveStatus: string;
      recommendations: string;
      notes: string;
    },
  ): Promise<typeof fallback | null> {
    const prompt = `Extract medical dictation into strict JSON with fields complaints, anamnesis, objectiveStatus, recommendations, notes. Keep concise clinical style. If missing keep fallback. Text: "${text}". Fallback: ${JSON.stringify(
      fallback,
    )}`;

    return safeParseJson<typeof fallback>(await callProvider(prompt));
  },
};
