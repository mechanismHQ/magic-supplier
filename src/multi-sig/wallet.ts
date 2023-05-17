import { c } from '../config';
import * as btc from '@scure/btc-signer';
import { selectCoins, tryBroadcastScure } from '../wallet';
import { validateMaxSize, getTxOverheadVBytes, outputWeight } from '../wallet/utils';
import ElectrumClient, { Unspent } from 'electrum-client-sl';
import { hex } from '@scure/base';
import { logger } from '../logger';
import { getBtcTxUrl, isNotNullish } from '../utils';
// import { fetch } from 'cross-fetch';
import axios from 'axios';

function getSizeOfScriptLengthElement(length: number) {
  if (length < 75) {
    return 1;
  } else if (length <= 255) {
    return 2;
  } else if (length <= 65535) {
    return 3;
  } else if (length <= 4294967295) {
    return 5;
  } else {
    throw new Error('Invalid redeem size');
  }
}

/**
 * Calculate tx weight for a multisig transaction.
 *
 * Assumes 1 output to recipient and one change to self.
 * @param inputs
 * @param output The output script of the recipient
 */
export function msTxWeight(inputs: number, output: Uint8Array) {
  const ms = c().multisigConfig;
  const n = ms.msPublicKeys.length;
  const m = ms.minSigners;
  const redeemScriptSize =
    1 + // OP_M
    n * (1 + 33) + // OP_PUSH33 <pubkey>
    1 + // OP_N
    1; // OP_CHECKMULTISIG

  const inputWitnessSize =
    1 + // size(0)
    m * (1 + 72) + // size(SIGNATURE_SIZE) + signature
    getSizeOfScriptLengthElement(redeemScriptSize) +
    redeemScriptSize;

  const outputSize = outputWeight(output);

  const inputSize =
    36 + // outpoint (spent UTXO ID)
    inputWitnessSize / 4 + // witness program
    4; // nSequence

  const txVBytes =
    getTxOverheadVBytes(true, inputs, 2) + //overhead
    inputSize * inputs + //inputs
    outputSize + // output
    43; // change

  return txVBytes;
}

export function msCoinSelectWeightFn(output: Uint8Array) {
  return (inputs: number) => {
    const w = msTxWeight(inputs, output);
    return BigInt(w.toFixed(0));
  };
}

export async function constructUnsignedMsTx({
  amount,
  recipient,
  client,
}: {
  amount: bigint;
  recipient: Uint8Array;
  client: ElectrumClient;
}) {
  const tx = new btc.Transaction();
  const weightFn = msCoinSelectWeightFn(recipient);
  const { coins, fee, total } = await selectCoins(amount, client, weightFn);
  const ms = c().p2ms;
  coins.forEach(coin => {
    tx.addInput({
      txid: coin.tx_hash,
      index: coin.tx_pos,
      witnessScript: ms.witnessScript,
      witnessUtxo: {
        script: ms.script,
        amount: BigInt(coin.value),
      },
    });
  });

  const change = total - amount - fee;

  tx.addOutput({
    script: recipient,
    amount,
  });
  tx.addOutput({
    script: ms.script,
    amount: change,
  });

  return tx;
}

export async function sendBtcMultiSig({
  amount,
  recipient,
  client,
  swapId,
  maxSize,
}: {
  amount: bigint;
  recipient: Uint8Array;
  client: ElectrumClient;
  swapId: bigint;
  maxSize?: number;
}) {
  const unsigned = await constructUnsignedMsTx({ amount, recipient, client });
  const config = c();
  const ms = config.multisigConfig;
  if (ms.mode !== 'leader') {
    throw new Error('Only leader can initiate send');
  }
  unsigned.sign(config.btcPrivateKey);

  let psbtHex = hex.encode(unsigned.toPSBT());

  const swapIdN = Number(swapId);
  let numSigs = 1;

  for (let i = 0; i < ms.followers.length; i++) {
    if (numSigs === ms.minSigners) {
      break;
    }
    const urlBase = ms.followers[i];
    const url = `${urlBase}/multi-sig/sign-psbt`;
    try {
      const r = await axios.post(
        url,
        {
          psbt: psbtHex,
          swapId: swapIdN,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      if (r.status === 200) {
        const { psbt } = r.data as { psbt: string };
        // const { psbt } = (await res.json()) as { psbt: string };
        numSigs++;
        psbtHex = psbt;
      }
    } catch (error) {
      logger.error(
        {
          swapId: swapIdN,
          follower: urlBase,
        },
        `Unable to get signature from follower`
      );
    }
  }

  if (numSigs < ms.minSigners) {
    throw new Error('Unable to get required signatures');
  }

  const txFinal = btc.Transaction.fromPSBT(hex.decode(psbtHex));
  txFinal.finalize();

  validateMaxSize(txFinal, maxSize);

  const txid = await tryBroadcastScure(client, txFinal);
  if (txid) {
    logger.debug({ txid, txUrl: getBtcTxUrl(txid), topic: 'sendBtc' });
  }
  return txFinal.id;
}
