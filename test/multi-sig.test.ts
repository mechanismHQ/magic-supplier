import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { describe, expect, test, vi } from 'vitest';
import { api } from '../src/index';
import { BitcoinNetwork } from 'magic-protocol';

export const PRIVATE_KEYS = [
  '4c21c96c3c541da9c483dc5afd184d96961f86ff2e28707ec50591ac2e9b4e1f',
  'cb16df43098c19169068d907952bc194c9418b48c600d4e3ef1a48ce8ce78d0c',
  'a3f1d701f5682537fa3181ee27dcc880ea85d455f67786f045bc93e1a6fdbec1',
].map(hex.decode);

const WIFS = PRIVATE_KEYS.map(k => btc.WIF(BitcoinNetwork.Testnet).encode(k));

export const PUBLIC_KEYS = PRIVATE_KEYS.map(key => {
  return secp256k1.getPublicKey(key);
});

const minSigners = 2;

const ms = btc.p2wsh(btc.p2ms(minSigners, PUBLIC_KEYS));

test('basic multi-sig route', async () => {
  const server1 = await api({
    ms: {
      msPublicKeys: PUBLIC_KEYS.map(hex.encode),
      minSigners,
      mode: 'follower',
    },
    stxSignerKey: hex.encode(PRIVATE_KEYS[0]),
    btcSignerKey: WIFS[0],
    supplierId: 0,
    networkKey: 'mocknet',
  });

  const amount = 1000000n;
  const tx = new btc.Transaction({ version: 2 });
  tx.addInput({
    txid: '75ddabb27b8845f5247975c8a5ba7c6f336c4570708ebe230caf6db5217ae858',
    redeemScript: ms.witnessScript,
    index: 0,
    sighashType: btc.SignatureHash.ALL,
    witnessScript: ms.witnessScript,
    witnessUtxo: {
      script: ms.script,
      amount: amount * 2n,
    },
  });

  tx.addOutput({
    script: btc.p2pkh(PUBLIC_KEYS[0]).script,
    amount,
  });

  tx.addOutput({
    script: ms.script,
    amount: amount - 1000n,
  });

  vi.mock('../src/stacks-api', () => {
    return {
      getCurrentBlockHeight: () => ({
        stx: 100,
        btc: 1000,
      }),
    };
  });

  vi.mock('../src/multi-sig/fetchers', () => {
    return {
      getOutboundSwapDetails: () => ({
        output: btc.p2pkh(PUBLIC_KEYS[0]).script,
        sats: 1000000n,
        createdAt: 94n,
        swapId: 0n,
      }),
    };
  });

  const psbt1 = hex.encode(tx.toPSBT());

  const res = await server1.inject({
    method: 'POST',
    url: '/multi-sig/sign-psbt',
    payload: {
      psbt: psbt1,
      swapId: 1,
    },
  });

  if (res.statusCode !== 200) {
    console.log(res.json());
    expect(res.statusCode).toEqual(200);
  }

  const { psbt } = res.json<{ psbt: string }>();

  const server2 = await api({
    ms: {
      msPublicKeys: PUBLIC_KEYS.map(hex.encode),
      minSigners,
      mode: 'follower',
    },
    btcSignerKey: WIFS[1],
    supplierId: 0,
    networkKey: 'mocknet',
    stxSignerKey: hex.encode(PRIVATE_KEYS[1]),
  });

  const res2 = await server2.inject({
    method: 'POST',
    url: '/multi-sig/sign-psbt',
    payload: {
      psbt,
      swapId: 1,
    },
  });

  if (res.statusCode !== 200) {
    console.log(res.json());
    expect(res.statusCode).toEqual(200);
  }

  const res2Data = res2.json<{ psbt: string }>();

  const txFinal = btc.Transaction.fromPSBT(hex.decode(res2Data.psbt));

  const finalInput = txFinal.getInput(0);

  expect(finalInput.partialSig?.length).toEqual(2);

  txFinal.finalize();
});

test.todo('Validate recipient address for swap');
test.todo('Validate change address');
test.todo('Validate swap not already sent');
test.todo('Validate confirmation threshold reached');
test.todo('Validate swap not expired');
test.todo('Validate recipient amount');
