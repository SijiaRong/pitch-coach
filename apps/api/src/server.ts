import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = await createApp(config, { logger: true });
await app.listen({ host: config.HOST, port: config.PORT });
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    void app.close();
  });
