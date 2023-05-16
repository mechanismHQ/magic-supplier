import { ECPair } from 'bitcoinjs-lib';
import { getBtcNetwork } from '../src/config';
import * as btc from '@scure/btc-signer';
import { c } from '../src/config';
import { hex } from '@scure/base';

function run() {
  const config = c();
  const [pk] = process.argv.slice(2);
  console.log(`Private key: ${pk}`);
  const wif = btc.WIF(config.scureBtcNetwork).encode(hex.decode(pk));
  // const pkHex = Buffer.from(pk, 'hex').slice(0, 32);
  // const ec = ECPair.fromPrivateKey(pkHex, { network: getBtcNetwork() });
  // const wif = ec.toWIF();
  console.log(`WIF: ${wif}`);
  return Promise.resolve(true);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
