import { test, expect, describe, beforeEach } from 'vitest';
import { ServerConfig, ConfigInit, MultiSigSchema, ConfigEnv, multiSigSchema } from '../src/config';
import { msTxWeight } from '../src/multi-sig/wallet';
import * as btc from '@scure/btc-signer';
import { pkhTxWeight } from '../src/wallet';

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
