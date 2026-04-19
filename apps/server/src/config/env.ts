import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8788),
  HOST: z.string().default('127.0.0.1'),
  LLM_API_KEY: z.string().optional(),
  LLM_API_URL: z.string().url().default('https://api.openai.com/v1/chat/completions'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
});

export type AppEnv = z.infer<typeof envSchema>;

export const readEnv = (): AppEnv => envSchema.parse(process.env);
