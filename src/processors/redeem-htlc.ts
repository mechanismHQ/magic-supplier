import { c, getSupplierId } from '../config';
import { getRedeemedHTLC, setRedeemedHTLC, RedisClient } from '../store';
import { logger as _logger } from '../logger';
import { getFeeRate, outputWeight, tryBroadcast, withElectrumClient } from '../wallet';
import { bridgeContract, stacksProvider } from '../stacks';
import { bytesToHex, hexToBytes } from 'micro-stacks/common';
import { getBtcTxUrl, satsToBtc, toBigInt } from '../utils';
import { Event, isFinalizeInboundPrint } from '../events';
import { Transaction, Script } from '@scure/btc-signer';
import { createHtlcScript, encodeHtlcOutput } from 'magic-protocol';
import { isBytes } from 'micro-packed';

const logger = _logger.child({ topic: 'redeemHTLC' });

export async function processFinalizedInbound(event: Event, client: RedisClient) {
  const { print } = event;
  if (!isFinalizeInboundPrint(print)) return;
  const { preimage } = print;
  if (print.supplier !== BigInt(getSupplierId())) return;
  const txidHex = bytesToHex(print.txid);
  const l = logger.child({
    txid: txidHex,
    event: {
      ...print,
      preimage: bytesToHex(preimage),
      hash: bytesToHex(print.hash),
      txid: bytesToHex(print.txid),
    },
  });
  try {
    const redeemed = await getRedeemedHTLC(client, txidHex);
    l.info(`Processing redeem of HTLC txid ${txidHex}`);
    if (redeemed) {
      l.debug(`Already redeemed ${txidHex} in ${redeemed}`);
      return { skipped: true };
    }
    if (preimage === null) {
      l.error('Error redeeming: no preimage');
      return { error: 'No preimage' };
    }
    const redeemTxid = await redeem(txidHex, preimage);
    await setRedeemedHTLC(client, txidHex, redeemTxid);
    return {
      redeemTxid,
      amount: satsToBtc(print.xbtc),
    };
  } catch (error) {
    l.error({ error, errorString: String(error) }, `Error redeeming HTLC: ${String(error)}`);
    throw error;
  }
}

/**
 * Redeem an HTLC
 *
 * If the supplier is in multi-sig mode, the funds will be sent to that wallet.
 * Otherwise, the funds are sent to the p2pkh address of the supplier.
 *
 */
export async function redeem(txid: string, preimage: Uint8Array) {
  return withElectrumClient(async client => {
    const bridge = bridgeContract();
    const config = c();
    const provider = stacksProvider();
    const swap = await provider.roOk(bridge.getFullInbound(hexToBytes(txid)));

    const witnessScript = swap.redeemScript;
    const htlcOutput = encodeHtlcOutput(witnessScript);
    const feeRate = await getFeeRate(client);
    const recipient = config.btcMainOutput;
    const weight = 300 + outputWeight(recipient);
    const fee = toBigInt(weight * feeRate);

    const tx = new Transaction({ allowUnknowInput: true });

    tx.addInput({
      txid: txid,
      index: Number(swap.outputIndex),
      witnessUtxo: {
        script: htlcOutput,
        amount: swap.sats,
      },
      witnessScript,
    });

    tx.addOutput({
      script: recipient,
      amount: swap.sats - fee,
    });

    tx.sign(config.btcPrivateKey);

    const input = tx.getInput(0)!;
    const partial = input.partialSig!;
    input.finalScriptWitness = [partial[0][1], preimage, new Uint8Array([1]), witnessScript];
    tx.updateInput(0, input);

    // to debug:
    // const lastTx = await client.blockchain_transaction_get(txid, true);
    // console.log(`btcdeb --tx=${tx.hex} --txin=${lastTx.hex}`);

    const finalId = tx.id;
    await tryBroadcast(client, tx);
    const btcAmount = satsToBtc(swap.sats);
    logger.info(
      { redeemTxid: finalId, txUrl: getBtcTxUrl(finalId), htlcTxid: txid, amount: swap.sats },
      `Redeemed inbound HTLC for ${btcAmount} BTC`
    );
    return finalId;
  });
}
