import { logConfig, validateConfig, c } from '../src/config';
import { withElectrumClient } from '../src/wallet';

async function run() {
  const config = c();
  const configKeys = config.validateConfig();
  config.logConfig(configKeys);
  await withElectrumClient(async client => {
    const feeRate = await client.blockchainEstimatefee(1);
    console.log('feeRatePerKb', feeRate);
    console.log('sats/vB', feeRate * 1024);
    return;
  });
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
