import { secp256k1 } from '@noble/curves/secp256k1';
import { ServerConfig } from '../src/config';
import { bytesToHex } from 'micro-stacks/common';
import { prompt } from 'inquirer';
import { WIF } from '@scure/btc-signer';

interface Answers {
  networkKey: string;
}

async function run() {
  const answers = await prompt<Answers>([
    {
      name: 'networkKey',
      type: 'list',
      choices: ['testnet', 'mainnet', 'mocknet'],
      default: 'testnet',
    },
  ]);
  process.env.SUPPLIER_NETWORK = answers.networkKey;
  const stxKey = secp256k1.utils.randomPrivateKey();

  const btcKey = secp256k1.utils.randomPrivateKey();

  const config = ServerConfig.load({
    stxSignerKey: bytesToHex(stxKey),
    networkKey: answers.networkKey,
    btcSignerKey: '',
  });
  const btcNetwork = config.btcNetwork;
  const btcWIF = WIF(btcNetwork).encode(btcKey);
  config.btcSignerKey = btcWIF;

  console.log('Your addresses:');
  console.log('BTC Address:', config.btcAddress);
  console.log('STX Address:', config.stxAddress);
  console.log('');

  console.log('Add to your .env file:');
  console.log(`SUPPLIER_NETWORK=${answers.networkKey}`);
  console.log(`SUPPLIER_STX_KEY=${bytesToHex(stxKey)}`);
  console.log(`SUPPLIER_BTC_KEY=${btcWIF}`);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
