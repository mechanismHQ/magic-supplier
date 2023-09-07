import { api } from '../src';
import { logger } from '../src/logger';

async function run() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;
  logger.info({ port }, 'Starting server');
  const app = await api();
  logger.info('App built, about to listen');
  const address = await app.listen({
    host: '0.0.0.0',
    port,
  });
  logger.info({ address }, `Listening at ${address}`);
}

run()
  .catch(error => {
    logger.error(error);
    process.exit(1);
  })
  .finally(() => {
    // process.exit();
  });
