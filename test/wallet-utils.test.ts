import { test, expect, describe, beforeEach } from 'vitest';
import { ServerConfig, ConfigInit, MultiSigSchema, ConfigEnv, multiSigSchema } from '../src/config';
import { msTxWeight } from '../src/multi-sig/wallet';
import * as btc from '@scure/btc-signer';
import { pkhTxWeight } from '../src/wallet';
import { hex } from '@scure/base';

const fakeConfig: ConfigInit = {
  stxSignerKey: 'aaa',
  btcSignerKey: 'aaa',
  supplierId: 0,
  networkKey: 'mocknet',
  ms: {
    minSigners: 2,
    msPublicKeys: ['aaa', 'bbb'],
    mode: 'follower',
  },
};

test('msTxWeight', () => {
  ServerConfig.load(fakeConfig);
  const inputs = 2;
  const addr = '134D6gYy8DsR5m4416BnmgASuMBqKvogQh';
  const outScript = btc.OutScript.encode(btc.Address().decode(addr));

  const weight = msTxWeight(inputs, outScript);

  expect(weight).toEqual(277.5);
});

test('p2pkhTxWeight', () => {
  ServerConfig.load(fakeConfig);
  const inputs = 2;
  const addr = '134D6gYy8DsR5m4416BnmgASuMBqKvogQh';
  const outScript = btc.OutScript.encode(btc.Address().decode(addr));

  const weight = pkhTxWeight(inputs, outScript);

  expect(weight).toEqual(375);
});

test('debugging bad tx hex', () => {
  const hexRaw =
    '0200000000010105407fbfe3724bd5e2b854810d259304daf6fe3fe5042e21d2f20c760f730ee20000000000ffffffff0248840100000000001976a914b194419b89062f73f27eb4f61805d32e191d737c88acb1bdcb1d000000002200203537e3b9f4d0953f0784538c933a5b02898b74dac77ff5942f593438ade4424104004730440220520ffcb0ff21a225e36cfa726c949be74a135d5d6fbc1657b2c4829c18324cf102201b4dba2d5981356c5d5dc2cab843ba796a670887bf53dab3c6ed4219a3c02c4201473044022052e2ad9157a120f891ac5413772933411f2bcbdfa821eb57bc2290746a1e5ee102207431d77124acae426dd22a4ebbf9933f968b95becffd71b6658503f9f2ed83cd014752210277f2d374a84c9f81689fbaf31f59b7231a0656796f128b0099e6e8546c7ece5f21020b797c01b53827f01c38ca7a326b8af53fb037a9481535386ed00441ed32f54052ae00000000';
  const tx = btc.Transaction.fromRaw(hex.decode(hexRaw));
  console.log(tx.getOutput(1).amount!);
  console.log(tx.getOutput(0).amount!);

  const totalOutSats = tx.getOutput(0).amount! + tx.getOutput(1).amount!;
  const totalOut = btc.Decimal.encode(totalOutSats);
  console.log('totalOut', totalOut);
  console.log(tx.inputsLength);
  console.log(tx.getInput(0));
});
