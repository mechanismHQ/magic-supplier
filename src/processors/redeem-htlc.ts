import { c, getBtcAddress, getBtcNetwork, getBtcSigner, getSupplierId } from '../config';
import { Psbt, script as bScript, payments, opcodes } from 'bitcoinjs-lib';
import { getRedeemedHTLC, setRedeemedHTLC, RedisClient } from '../store';
import { logger as _logger } from '../logger';
import {
  getFeeRate,
  outputWeight,
  tryBroadcast,
  tryBroadcastScure,
  withElectrumClient,
} from '../wallet';
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
    const redeemTxid = await redeemSegwithHtlc(txidHex, preimage);
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
    const tx = await client.blockchain_transaction_get(txid, true);
    const txHex = Buffer.from(tx.hex, 'hex');
    const bridge = bridgeContract();
    const config = c();
    const provider = stacksProvider();
    const swap = await provider.roOk(bridge.getFullInbound(hexToBytes(txid)));
    const network = config.btcNetwork;

    const psbt = new Psbt({ network });
    const signer = config.btcSigner;
    const weight = 351;
    const feeRate = await getFeeRate(client);
    const fee = weight * feeRate;

    psbt.addInput({
      hash: txid,
      index: Number(swap.outputIndex),
      nonWitnessUtxo: txHex,
      redeemScript: Buffer.from(swap.redeemScript),
    });

    psbt.addOutput({
      script: Buffer.from(config.btcMainOutput),
      value: Number(swap.sats) - fee,
    });
    await psbt.signInputAsync(0, signer);

    psbt.finalizeInput(0, (index, input, script) => {
      const partialSigs = input.partialSig;
      if (!partialSigs) throw new Error('Error when finalizing HTLC input');
      const inputScript = bScript.compile([
        partialSigs[0].signature,
        Buffer.from(preimage),
        opcodes.OP_TRUE,
      ]);
      const payment = payments.p2sh({
        redeem: {
          output: script,
          input: inputScript,
        },
      });
      return {
        finalScriptSig: payment.input,
        finalScriptWitness: undefined,
      };
    });

    const final = psbt.extractTransaction();
    const finalId = final.getId();
    await tryBroadcast(client, final);
    const btcAmount = satsToBtc(swap.sats);
    logger.info(
      { redeemTxid: finalId, txUrl: getBtcTxUrl(finalId), htlcTxid: txid, amount: swap.sats },
      `Redeemed inbound HTLC for ${btcAmount} BTC`
    );
    return finalId;
  });
}

export async function redeemSegwithHtlc(txid: string, preimage: Uint8Array) {
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
    await tryBroadcastScure(client, tx);
    const btcAmount = satsToBtc(swap.sats);
    logger.info(
      { redeemTxid: finalId, txUrl: getBtcTxUrl(finalId), htlcTxid: txid, amount: swap.sats },
      `Redeemed inbound HTLC for ${btcAmount} BTC`
    );
    return finalId;
  });
}
