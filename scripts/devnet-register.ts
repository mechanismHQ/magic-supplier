import 'cross-fetch/polyfill';
import { bridgeContract } from '../src/stacks';
import { bpsToPercent, btcToSats, satsToBtc } from '../src/utils';
import {
  getBtcAddress,
  getNetworkKey,
  getPublicKey,
  getStxAddress,
  getStxNetwork,
  validateKeys,
} from '../src/config';
import { PostConditionMode } from 'micro-stacks/transactions';
import BigNumber from 'bignumber.js';
import { getBalances } from '../src/wallet';
import { askStxFee, broadcastAndLog } from './helpers';

async function run() {
  const bridge = bridgeContract();

  try {
    validateKeys();
  } catch (error) {
    console.error('Unable to register supplier - environment not configured');
    console.error(error);
    return;
  }

  const stxAddress = getStxAddress();
  const btcAddress = getBtcAddress();
  const balances = await getBalances();
  const network = getStxNetwork();
  const networkKey = getNetworkKey();

  const stxBalance = balances.stx.stx;
  const xbtcBalance = balances.stx.xbtc;
  const btcBalance = balances.btc.btc;

  console.log(`STX Address: ${stxAddress}`);
  console.log(`BTC Address: ${btcAddress}`);
  console.log(`STX Balance: ${stxBalance} STX`);
  console.log(`xBTC Balance: ${xbtcBalance} xBTC`);
  console.log(`BTC Balance: ${btcBalance} BTC`);
  console.log(`Network: ${networkKey}`);
  console.log(`Stacks node: ${network.getCoreApiUrl()}`);

  // const { stxFee, ustxFee: fee } = await askStxFee(stxBalance);
  const stxFee = 1;
  const fee = 1000000;

  const inboundFee = 10n; // BigInt(answers.inboundFee);
  const inboundBaseFee = 500n; //BigInt(answers.inboundBaseFee);
  const outboundFee = 10n; //BigInt(answers.outboundFee);
  const outboundBaseFee = 500n; // BigInt(answers.outboundBaseFee);
  // const xbtcFunds = BigInt(answers.xbtcFunds);
  const xbtcFunds = new BigNumber(5).decimalPlaces(8);
  const xbtcFundsSats = btcToSats(xbtcFunds.toString());

  console.log(`Inbound fee: ${inboundFee} bips (${bpsToPercent(inboundFee)}%)`);
  console.log(`Inbound base fee: ${inboundBaseFee} sats (${satsToBtc(inboundBaseFee)} BTC)`);

  console.log(`Outbound fee: ${outboundFee} bips (${bpsToPercent(outboundFee)}%)`);
  console.log(`Outbound base fee: ${outboundBaseFee} sats (${satsToBtc(outboundBaseFee)} BTC)`);

  console.log(`xBTC funds: ${xbtcFunds.toFormat()} xBTC (${xbtcFundsSats} sats)`);

  console.log(`Transaction fee: ${stxFee} STX (${fee} uSTX)`);

  // const networkKey = getNetworkKey();
  if (networkKey !== 'mocknet') {
    throw new Error('Invalid - can only be used in devnet');
  }

  const btcPublicKey = getPublicKey();
  const registerTx = bridge.registerSupplier(
    Uint8Array.from(btcPublicKey),
    inboundFee,
    outboundFee,
    outboundBaseFee,
    inboundBaseFee,
    BigInt(xbtcFundsSats)
  );

  await broadcastAndLog(registerTx, {
    postConditionMode: PostConditionMode.Allow,
    fee,
  });
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
