import { createApp } from './app';
import { readEnv } from './config/env';

const start = async (): Promise<void> => {
  const env = readEnv();
  const app = await createApp();

  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
