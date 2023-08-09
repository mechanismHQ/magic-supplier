import ElectrumClient from 'electrum-client-sl';
import { getScriptHash, isNotNullish, shiftInt, toBigInt } from '../utils';
import { getElectrumConfig, c } from '../config';
import { logger } from '../logger';
import { OutScript, Transaction } from '@scure/btc-signer';
import { hex } from '@scure/base';

export const electrumClient = () => {
  const envConfig = getElectrumConfig();
  const electrumConfig = {
    ...envConfig,
  };
  return new ElectrumClient(electrumConfig.host, electrumConfig.port, electrumConfig.protocol);
};

export async function withElectrumClient<T = void>(
  cb: (client: ElectrumClient) => Promise<T>
): Promise<T> {
  const client = electrumClient();
  await client.connect();
  try {
    const res = await cb(client);
    await client.close();
    return res;
  } catch (error) {
    console.error(`Error from withElectrumConfig`, error);
    await client.close();
    throw error;
  }
}

export async function listUnspent(client: ElectrumClient) {
  // const { output } = getBtcPayment();
  const output = c().btcMainOutput;
  // if (!output) throw new Error('Unable to get output for operator wallet.');

  const scriptHash = getScriptHash(output);
  const unspents = await client.blockchain_scripthash_listunspent(hex.encode(scriptHash));
  return unspents;
}

export function outputWeight(output: Uint8Array) {
  const payment = OutScript.decode(output);
  switch (payment.type) {
    case 'pkh':
      return 34;
    case 'tr':
      return 43;
    case 'wsh':
      return 43;
    case 'sh':
      return 32;
    case 'wpkh':
      return 32;
    default:
      // shouldn't happen, but max size
      return 43;
  }
}

function getSizeOfVarInt(length: number) {
  if (length < 253) {
    return 1;
  } else if (length < 65535) {
    return 3;
  } else if (length < 4294967295) {
    return 5;
  } else {
    return 9;
  }
}

export function getTxOverheadVBytes(isWitness: boolean, inputs: number, outputs: number) {
  const witnessBytes = isWitness ? 0.5 + inputs / 4 : 0;

  return (
    4 + // nVersion
    getSizeOfVarInt(inputs) + // number of inputs
    getSizeOfVarInt(outputs) + // number of outputs
    4 + // nLockTime
    witnessBytes
  );
}

export function pkhTxWeight(inputs: number, output: Uint8Array) {
  const inputSize = 148;
  const outputSize = outputWeight(output);
  const txVBytes =
    getTxOverheadVBytes(true, inputs, 2) + //overhead
    inputSize * inputs + //inputs
    outputSize + // output
    34; // change

  return txVBytes;
}

export function wpkhTxWeight(inputs: number, output: Uint8Array) {
  const inputSize = 67.75;
  const outputSize = outputWeight(output);
  const txVBytes =
    getTxOverheadVBytes(true, inputs, 2) + //overhead
    inputSize * inputs + //inputs
    outputSize + // output
    34; // change

  return txVBytes;
}

export function pkhCoinSelectWeightFn(output: Uint8Array) {
  return (inputs: number) => {
    const w = pkhTxWeight(inputs, output);
    return toBigInt(w);
  };
}

export function wpkhCoinSelectWeightFn(output: Uint8Array) {
  return (inputs: number) => {
    const w = wpkhTxWeight(inputs, output);
    return toBigInt(w);
  };
}

export function validateMaxSize(tx: Transaction, maxSize?: number) {
  const txHex = tx.toBytes(true, false);
  if (isNotNullish(maxSize) && txHex.length > maxSize) {
    logger.error(
      {
        topic: 'btcTxSize',
        maxSize: maxSize,
        txSize: txHex.length,
      },
      `Unable to send BTC - tx of size ${txHex.length} bytes is over ${maxSize} bytes`
    );
    throw new Error(
      `Unable to send BTC - tx of size ${txHex.length} bytes is over ${maxSize} bytes`
    );
  }
}
