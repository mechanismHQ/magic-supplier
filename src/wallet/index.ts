import ElectrumClient, { Unspent } from 'electrum-client-sl';
import { btcToSats, getBtcTxUrl, getScriptHash, isNotNullish, shiftInt } from '../utils';
import {
  getBtcPayment,
  getBtcNetwork,
  getBtcSigner,
  getElectrumConfig,
  getStxNetwork,
  getStxAddress,
  getSupplierId,
  c,
} from '../config';
import { Psbt, Transaction } from 'bitcoinjs-lib';
import { logger } from '../logger';
import { fetchAccountBalances } from 'micro-stacks/api';
import { bridgeContract, stacksProvider, xbtcAssetId } from '../stacks';
import BigNumber from 'bignumber.js';
import { hexToBytes } from 'micro-stacks/common';
export * from './utils';
import {
  electrumClient,
  withElectrumClient,
  listUnspent,
  pkhCoinSelectWeightFn,
  wpkhCoinSelectWeightFn,
  validateMaxSize,
} from './utils';
import { Address, OutScript, Transaction as ScureTransaction } from '@scure/btc-signer';
import { sendBtcMultiSig } from '../multi-sig/wallet';
import { hex } from '@scure/base';

// Get the vB size of a BTC transaction.
// Calculations assume p2pkh inputs
// export function txWeight(inputs: number) {
//   const overhead = 10n;
//   const outputSize = 34n * BigInt(outputs);
//   const inputSize = 148n * BigInt(inputs);
//   return overhead + outputSize + inputSize;
// }

export type TxWeightFunction = (inputs: number) => bigint;

export async function selectCoins(
  amount: bigint,
  client: ElectrumClient,
  txWeightFn: TxWeightFunction
) {
  const unspents = await listUnspent(client);
  const sorted = unspents.sort((a, b) => (a.value < b.value ? 1 : -1));

  let coinAmount = 0n;
  const feeRate = BigInt(await getFeeRate(client));
  const selected: (Unspent & { hex: Buffer })[] = [];
  let filled = false;
  for (let i = 0; i < sorted.length; i++) {
    const utxo = sorted[i];
    const txHex = await client.blockchain_transaction_get(utxo.tx_hash);
    selected.push({
      ...utxo,
      hex: Buffer.from(txHex, 'hex'),
    });
    coinAmount += BigInt(utxo.value);
    const size = txWeightFn(selected.length);
    const fee = feeRate * size;
    if (coinAmount > amount + fee + 5500n) {
      filled = true;
      break;
    }
  }

  if (!filled) {
    throw new Error(`Unable to select enough UTXOs.`);
  }

  return {
    coins: selected,
    fee: feeRate * txWeightFn(selected.length),
    total: coinAmount,
  };
}

interface SendBtc {
  amount: bigint;
  recipient: Uint8Array;
  client: ElectrumClient;
  swapId: bigint;
  maxSize?: number;
}

export async function sendBtc(opts: SendBtc) {
  const config = c();
  let txid: string;
  if (config.hasMultisig()) {
    txid = await sendBtcMultiSig(opts);
  } else {
    // txid = await sendBtcSingleSig(opts);
    txid = await sendBtcSegwitSingleSig(opts);
  }
  return txid;
}

export async function sendBtcSegwitSingleSig(opts: SendBtc) {
  const { client, amount, ...logOpts } = opts;
  const config = c();
  // const recipient = Address(config.scureBtcNetwork).encode(OutScript.decode(opts.recipient));
  const weightFn = wpkhCoinSelectWeightFn(opts.recipient);
  const { coins, fee, total } = await selectCoins(opts.amount, client, weightFn);
  const senderPayment = config.wpkhPayment;

  const tx = new ScureTransaction();

  coins.forEach(coin => {
    tx.addInput({
      txid: coin.tx_hash,
      index: coin.tx_pos,
      witnessScript: senderPayment.witnessScript!,
      witnessUtxo: {
        script: senderPayment.script,
        amount: BigInt(coin.value),
      },
    });
  });

  const change = total - amount - fee;

  tx.addOutput({
    script: opts.recipient,
    amount,
  });

  tx.addOutput({
    script: senderPayment.script,
    amount: change,
  });

  tx.sign(config.btcPrivateKey);

  tx.finalize();

  validateMaxSize(tx, opts.maxSize);

  const txid = await tryBroadcastScure(client, tx);
  if (txid) {
    logger.debug({ ...logOpts, txid, txUrl: getBtcTxUrl(txid), topic: 'sendBtc' });
  }
  return tx.id;
}

export async function sendBtcSingleSig(opts: SendBtc) {
  const { client, ...logOpts } = opts;
  const config = c();
  const recipient = Address(config.scureBtcNetwork).encode(OutScript.decode(opts.recipient));
  // const outputScript = OutScript.encode(Address(config.scureBtcNetwork).decode(opts.recipient));
  const weightFn = pkhCoinSelectWeightFn(opts.recipient);
  const { coins, fee, total } = await selectCoins(opts.amount, client, weightFn);
  const network = getBtcNetwork();

  const psbt = new Psbt({ network });
  const { output, address } = getBtcPayment();
  const signer = getBtcSigner();
  if (!output || !address) throw new Error('Unable to get redeem script of wallet.');
  psbt.addInputs(
    coins.map(coin => {
      return {
        hash: coin.tx_hash,
        index: coin.tx_pos,
        // redeemScript: output,
        nonWitnessUtxo: coin.hex,
      };
    })
  );

  const change = total - opts.amount - fee;
  psbt.addOutput({
    address: recipient,
    value: Number(opts.amount),
  });
  psbt.addOutput({
    address,
    value: Number(change),
  });

  await psbt.signAllInputsAsync(signer);

  psbt.finalizeAllInputs();

  const final = psbt.extractTransaction();
  const hex = hexToBytes(final.toHex());
  if (isNotNullish(opts.maxSize) && hex.length > opts.maxSize) {
    logger.error(
      {
        topic: 'btcTxSize',
        maxSize: opts.maxSize,
        txSize: hex.length,
      },
      `Unable to send BTC - tx of size ${hex.length} bytes is over ${opts.maxSize} bytes`
    );
    throw new Error(
      `Unable to send BTC - tx of size ${hex.length} bytes is over ${opts.maxSize} bytes`
    );
  }
  const txid = await tryBroadcast(client, final);
  if (txid) {
    logger.debug({ ...logOpts, txid, txUrl: getBtcTxUrl(txid), topic: 'sendBtc' });
  }
  return final.getId();
}

export async function tryBroadcast(client: ElectrumClient, tx: Transaction) {
  const id = tx.getId();
  try {
    await client.blockchain_transaction_broadcast(tx.toHex());
    const amount = tx.outs[0].value;
    logger.info(
      {
        topic: 'btcBroadcast',
        txid: id,
        txUrl: getBtcTxUrl(id),
        amount,
      },
      `Broadcasted BTC tx ${id}`
    );
    return id;
  } catch (error) {
    logger.error({ broadcastError: error, txId: id }, `Error broadcasting: ${id}`);
    if (typeof error === 'string' && !error.includes('Transaction already in block chain')) {
      if (
        error.includes('Transaction already in block chain') ||
        error.includes('inputs-missingorspent')
      ) {
        logger.debug(`Already broadcasted redeem in ${id}`);
        await client.close();
        return;
      }
    }
    await client.close();
    throw error;
  }
}

export async function tryBroadcastScure(client: ElectrumClient, tx: ScureTransaction) {
  const id = tx.id;
  try {
    await client.blockchain_transaction_broadcast(tx.hex);
    const amount = Number(tx.getOutput(0).amount!);
    logger.info(
      {
        topic: 'btcBroadcast',
        txid: id,
        txUrl: getBtcTxUrl(id),
        amount,
      },
      `Broadcasted BTC tx ${id}`
    );
    return id;
  } catch (error) {
    logger.error({ broadcastError: error, txId: id }, `Error broadcasting: ${id}`);
    if (typeof error === 'string' && !error.includes('Transaction already in block chain')) {
      if (
        error.includes('Transaction already in block chain') ||
        error.includes('inputs-missingorspent')
      ) {
        logger.debug(`Already broadcasted redeem in ${id}`);
        await client.close();
        return;
      }
    }
    await client.close();
    throw error;
  }
}

// Get Bitcoin fee rate from Electrum's "estimatefee" method.
// Returns sats/vB fee rate for targeting 1-block confirmation
export async function getFeeRate(client: ElectrumClient) {
  const btcPerKb = await client.blockchainEstimatefee(1);
  if (btcPerKb === -1) {
    logger.error('Unable to get fee rate from Electrum.');
    return 1;
  }
  const satsPerKb = btcToSats(btcPerKb);
  const satsPerByte = new BigNumber(satsPerKb).dividedBy(1024).toNumber();
  return Math.ceil(satsPerByte);
}

export async function getBtcBalance() {
  const balances = await withElectrumClient(async client => {
    // const { output } = getBtcPayment();
    const output = c().btcMainOutput;
    // if (!output) throw new Error('Unable to get output for operator wallet.');

    const scriptHash = getScriptHash(Buffer.from(output));
    const balance = await client.blockchain_scripthash_getBalance(hex.encode(scriptHash));
    const { confirmed, unconfirmed } = balance;
    const total = confirmed + unconfirmed;
    const btc = shiftInt(total, -8).toNumber();
    return {
      confirmed,
      total,
      unconfirmed,
      btc,
    };
  });
  return balances;
}

export async function getStxBalance() {
  const network = getStxNetwork();
  const stxAddress = getStxAddress();
  const balances = await fetchAccountBalances({
    url: network.getCoreApiUrl(),
    principal: stxAddress,
  });
  const xbtcId = xbtcAssetId();
  const stxBalance = shiftInt(balances.stx.balance, -6);
  const xbtcSats = balances.fungible_tokens[xbtcId]?.balance || '0';
  return {
    stx: stxBalance.decimalPlaces(6).toNumber(),
    xbtc: shiftInt(xbtcSats, -8).toNumber(),
    xbtcSats,
  };
}

export async function getXbtcFunds() {
  const bridge = bridgeContract();
  const provider = stacksProvider();
  try {
    const supplierId = getSupplierId();
    const funds = await provider.ro(bridge.getFunds(supplierId));
    return {
      xbtc: shiftInt(funds, -8).toNumber(),
    };
  } catch (error) {
    return {
      xbtc: 0,
    };
  }
}

export async function getBalances() {
  const [stx, btc, xbtc] = await Promise.all([getStxBalance(), getBtcBalance(), getXbtcFunds()]);
  return {
    stx,
    btc,
    xbtc,
  };
}
