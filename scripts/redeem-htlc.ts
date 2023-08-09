import 'cross-fetch/polyfill';
import { redeem } from '../src/processors/redeem-htlc';
import { hexToBytes } from 'micro-stacks/common';
import { getBtcTxUrl } from '../src/utils';

const [txid, preimageHex] = process.argv.slice(2);

async function run() {
  const preimage = hexToBytes(preimageHex);
  const redeemTxid = await redeem(txid, preimage);
  console.log(getBtcTxUrl(redeemTxid));
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
