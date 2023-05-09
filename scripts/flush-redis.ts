import { createRedisClient, removeAll } from '../src/store';
import { prompt } from 'inquirer';
import { isNullish } from '../src/utils';

async function run() {
  const client = createRedisClient();

  let ok = true;
  const url = process.env.REDIS_URL || process.env.REDISTOGO_URL;
  if (!isNullish(url)) {
    ok = (
      await prompt<{ ok: boolean }>([
        {
          name: 'ok',
          type: 'confirm',
          message: 'WARNING: you are about to erase the Redis database. Continue?',
        },
      ])
    ).ok;
  }
  if (ok) {
    await removeAll(client);
    console.log('Redis flushed.');
  }
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
