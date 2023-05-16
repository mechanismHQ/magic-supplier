import { config as dotenv } from 'dotenv';
import { initWorkerThread } from '../../src/worker';
import { api } from '../../src/index';
import { ServerConfig, c } from '../../src/config';

dotenv({
  path: '.env.multisig',
  override: true,
});

const secondSigner = process.env.SECOND_SIGNER_KEY!;
console.log('secondSigner', secondSigner);

async function run() {
  initWorkerThread();
  const startConfig = c().toObject();

  const signer = await api({
    btcSignerKey: secondSigner,
    ms: {
      ...startConfig.ms!,
      mode: 'follower',
    },
  });

  const port = 9999;

  await signer.listen({
    host: '0.0.0.0',
    port,
  });

  console.log(`Signer listening on http://localhost:${port}`);
}

run()
  .catch(console.error)
  .finally(() => {
    // process.exit();
  });
