import { test, expect, describe, beforeEach } from 'vitest';
import { ServerConfig, ConfigInit, MultiSigSchema, ConfigEnv, multiSigSchema } from '../src/config';

const fakeConfig: ConfigInit = {
  stxSignerKey: 'aaa',
  btcSignerKey: 'aaa',
  supplierId: 0,
  networkKey: 'mocknet',
};

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
  });
});
