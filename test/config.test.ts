import { test, expect, describe, beforeEach } from 'vitest';
import { ServerConfig, ConfigInit, MultiSigSchema, ConfigEnv, multiSigSchema } from '../src/config';
import { hex } from '@scure/base';
import { payments } from 'bitcoinjs-lib';
import { WIF, TEST_NETWORK } from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';

const fakeConfig: ConfigInit = {
  stxSignerKey: 'aaa',
  btcSignerKey: 'aaa',
  supplierId: 0,
  networkKey: 'mocknet',
};

export const PRIVATE_KEYS = [
  '4c21c96c3c541da9c483dc5afd184d96961f86ff2e28707ec50591ac2e9b4e1f',
  'cb16df43098c19169068d907952bc194c9418b48c600d4e3ef1a48ce8ce78d0c',
  'a3f1d701f5682537fa3181ee27dcc880ea85d455f67786f045bc93e1a6fdbec1',
].map(hex.decode);

export const PUBLIC_KEYS = PRIVATE_KEYS.map(key => {
  return secp256k1.getPublicKey(key);
});

const pubKeysHex = PUBLIC_KEYS.map(hex.encode);

describe('config', () => {
  beforeEach(() => {
    Object.values(ConfigEnv).forEach(key => {
      delete process.env[key];
    });
  });

  test('works without multi-sig', () => {
    const config = ServerConfig.load(fakeConfig);
    expect(config.toObject()).toEqual(fakeConfig);
  });

  describe('multi-sig schema', () => {
    const baseMs = {
      minSigners: 2,
      msPublicKeys: ['aaa', 'bbb'],
    };
    test('follower mode doesnt need followers key', () => {
      multiSigSchema.parse({
        ...baseMs,
        mode: 'follower',
      });
    });

    test('leaders followers must be included for all pubkeys', () => {
      const result = multiSigSchema.safeParse({
        ...baseMs,
        mode: 'leader',
        followers: ['http://url.com'],
      });
      expect(result.success).toEqual(true);
    });

    test('works with env variables', () => {
      process.env[ConfigEnv.MinSigners] = '2';
      process.env[ConfigEnv.MsMode] = 'leader';
      process.env[ConfigEnv.MsPublicKeys] = 'aaa,bbb';
      process.env[ConfigEnv.Followers] = 'http://url.com';

      const config = ServerConfig.load(fakeConfig);
      expect(config.hasMultisig()).toEqual(true);

      const ms = config.multisigConfig;
      expect(ms.minSigners).toEqual(2);
      expect(ms.mode).toEqual('leader');
      expect(ms.msPublicKeys).toEqual(['aaa', 'bbb']);
      expect(ms.followers).toEqual(['http://url.com']);
    });

    test('multisig public keys must have signer', () => {
      const config = ServerConfig.load({
        ...fakeConfig,
        btcSignerKey: WIF(TEST_NETWORK).encode(PRIVATE_KEYS[0]),
        ms: {
          ...baseMs,
          msPublicKeys: [pubKeysHex[1], pubKeysHex[2]],
          mode: 'follower',
        },
      });

      expect(() => config.validateMultisigConfig()).toThrow();
    });

    test('leader must be first public key', () => {
      const config = ServerConfig.load({
        ...fakeConfig,
        btcSignerKey: WIF(TEST_NETWORK).encode(PRIVATE_KEYS[0]),
        ms: {
          ...baseMs,
          msPublicKeys: [pubKeysHex[1], pubKeysHex[0]],
          followers: ['http://url.com'],
          mode: 'leader',
        },
      });
      expect(() => config.validateMultisigConfig()).toThrow('leader must be the first');
    });
  });

  test('using noble/curves to get public key', () => {
    const config = ServerConfig.load({
      ...fakeConfig,
      btcSignerKey: WIF(TEST_NETWORK).encode(PRIVATE_KEYS[0]),
    });

    const configPk = config.publicKey;
    const fromBitcoinJs = Uint8Array.from(config.btcSigner.publicKey);
    expect(hex.encode(configPk)).toEqual(hex.encode(fromBitcoinJs));
  });
});
