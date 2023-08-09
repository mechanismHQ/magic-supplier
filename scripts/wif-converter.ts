import * as btc from '@scure/btc-signer';
import { c } from '../src/config';
import { hex } from '@scure/base';

function run() {
  const config = c();
  const [pk] = process.argv.slice(2);
  console.log(`Input: ${pk}`);
  try {
    const wif = btc.WIF(config.btcNetwork).encode(hex.decode(pk));
    console.log(`WIF: ${wif}`);
  } catch (error) {
    const priv = btc.WIF(config.btcNetwork).decode(pk);
    console.log('Private key:', hex.encode(priv));
  }

  return Promise.resolve(true);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
