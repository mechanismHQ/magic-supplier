import { api } from '../src';
import { logger } from '../src/logger';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;
logger.info({ port }, 'Starting server');
const app = await api();
logger.info('App built, about to listen');
app.listen(
  {
    host: '0.0.0.0',
    port,
  },
  (err, address) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
    logger.info({ address }, `Listening at ${address}`);
  }
);
