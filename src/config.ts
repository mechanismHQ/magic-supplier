import { ECPair, networks, payments } from 'bitcoinjs-lib';
import { StacksNetworkVersion } from 'micro-stacks/crypto';
import { StacksMainnet, StacksMocknet, StacksNetwork, StacksTestnet } from 'micro-stacks/network';
import { logger } from './logger';
import { bridgeContract, stacksProvider } from './stacks';
import { makeStxAddress } from './utils';
import { z } from 'zod';
import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';

// const minSignersSchema = z.number();
// const msPublicKeysSchema = z.array(z.string());

export const multiSigBaseSchema = z.object({
  minSigners: z.number(),
  msPublicKeys: z.array(z.string()),
  // mode: z.union([z.literal('leader'), z.literal('follower')]),
});

const leaderConfigSchema = multiSigBaseSchema.extend({
  mode: z.literal('leader'),
  followers: z.array(z.string().url()),
});

const followerSchema = multiSigBaseSchema.extend({
  mode: z.literal('follower'),
  followers: z.optional(z.array(z.string().url())),
});

export const multiSigSchema = z.union([leaderConfigSchema, followerSchema]).refine(
  val => {
    return val.mode === 'follower' || val.followers.length === val.msPublicKeys.length - 1;
  },
  {
    message: 'Follower URL must be provided for all public keys',
  }
);

export const serverConfigSchema = z.object({
  btcSignerKey: z.string(),
  supplierId: z.number(),
  stxSignerKey: z.string(),
  networkKey: z.string(),
  ms: z.optional(multiSigSchema),
});

// export const multisigConfigSchema = baseServerSchema.merge(multiSigSchema);

// export const serverConfigSchema = z.union([baseServerSchema, multisigConfigSchema]);

// export type BaseConfigSchema = z.infer<typeof baseServerSchema>;

export type MultiSigSchema = z.infer<typeof multiSigSchema>;

export type ConfigInit = z.infer<typeof serverConfigSchema>;

export enum ConfigEnv {
  Network = 'SUPPLIER_NETWORK',
  BtcKey = 'SUPPLIER_BTC_KEY',
  StxKey = 'SUPPLIER_STX_KEY',
  Id = 'SUPPLIER_ID',
  MinSigners = 'SUPPLIER_MIN_SIGNERS',
  MsPublicKeys = 'SUPPLIER_MS_PUBLIC_KEYS',
  MsMode = 'SUPPLIER_MS_MODE',
  Followers = 'SUPPLIER_FOLLOWERS',
}

export function c() {
  return ServerConfig.i();
}

export class ServerConfig {
  public btcSignerKey: string;
  public supplierId: number;
  public stxSignerKey: string;
  public networkKey: string;
  public ms?: MultiSigSchema;

  private static instance?: ServerConfig;

  private constructor(config: ConfigInit) {
    this.btcSignerKey = config.btcSignerKey;
    this.supplierId = config.supplierId;
    this.stxSignerKey = config.stxSignerKey;
    this.networkKey = config.networkKey;
    this.ms = config.ms;
    // this.msPublicKeys = config.msPublicKeys;
    // this.minSigners = config.minSigners;
  }

  static i() {
    if (!this.instance) {
      this.instance = ServerConfig.load();
    }
    return this.instance;
  }

  static override(config: Partial<ConfigInit>) {
    this.instance = ServerConfig.load(config);
  }

  static getEnv(key: ConfigEnv | string, required?: true): string;
  static getEnv(key: ConfigEnv | string, required: false): string | undefined;
  static getEnv(key: ConfigEnv | string, required = true) {
    const oldKey = key.replace(/^SUPPLIER/, 'OPERATOR');
    const value = process.env[oldKey] || process.env[key];
    if (required && !value) throw new Error(`Missing required ENV variable: ${key}`);
    return value;
  }

  static load(partialConfig?: Partial<ConfigInit>) {
    const btcSignerKey = partialConfig?.btcSignerKey || this.getEnv(ConfigEnv.BtcKey);
    const supplierId = partialConfig?.supplierId ?? parseInt(this.getEnv(ConfigEnv.Id), 10);
    const stxSignerKey = partialConfig?.stxSignerKey || this.getEnv(ConfigEnv.StxKey);
    const networkKey = partialConfig?.networkKey || this.getEnv(ConfigEnv.Network);
    const configValues: ConfigInit = {
      btcSignerKey,
      supplierId,
      stxSignerKey,
      networkKey,
      ms: undefined,
    };
    const minSignersEnv = this.getEnv(ConfigEnv.MinSigners, false);
    const ms = partialConfig?.ms;
    if (ms || typeof minSignersEnv !== 'undefined') {
      const msPublicKeys = ms?.msPublicKeys || this.getEnv(ConfigEnv.MsPublicKeys).split(',');
      const minSigners = ms?.minSigners ?? parseInt(this.getEnv(ConfigEnv.MinSigners), 10);
      const mode = ms?.mode || this.getEnv(ConfigEnv.MsMode);
      let followers: string[] | undefined;
      if (mode === 'leader') {
        followers = ms?.followers || this.getEnv(ConfigEnv.Followers)?.split(',');
      }
      configValues.ms = {
        msPublicKeys,
        minSigners,
        mode: mode as 'follower',
        followers,
      };
    }

    const config = serverConfigSchema.parse(configValues);

    const instance = new ServerConfig(config);
    ServerConfig.instance = instance;
    return instance;
  }

  toObject(): ConfigInit {
    return {
      btcSignerKey: this.btcSignerKey,
      supplierId: this.supplierId,
      stxSignerKey: this.stxSignerKey,
      networkKey: this.networkKey,
      ms: this.ms,
    };
  }

  get p2ms() {
    const { msPublicKeys, minSigners } = this.multisigConfig;
    return btc.p2wsh(btc.p2ms(minSigners, msPublicKeys.map(hex.decode)));
  }

  hasMultisig() {
    return typeof this.ms !== 'undefined';
  }

  /**
   * Returns the address that will receive BTC from HTLC redemptions.
   *
   * This is also the address that outbound transfers will be made from.
   */
  get btcMainWallet() {
    if (this.hasMultisig()) {
      return this.p2ms.address!;
    }
    return this.btcAddress;
  }

  get multisigConfig() {
    if (typeof this.ms === 'undefined') {
      throw new Error('Missing multi-sig configuration');
    }

    return this.ms;
  }

  get btcNetwork() {
    switch (this.networkKey) {
      case 'mocknet':
        return networks.regtest;
      case 'mainnet':
        return networks.bitcoin;
      case 'testnet':
        return networks.testnet;
      default:
        throw new Error(`Invalid SUPPLIER_NETWORK: ${this.networkKey}`);
    }
  }

  get scureBtcNetwork() {
    if (this.networkKey === 'mainnet') return btc.NETWORK;
    return btc.TEST_NETWORK;
  }

  get stxNetwork() {
    switch (this.networkKey) {
      case 'mocknet':
        return new StacksMocknet();
      case 'mainnet':
        return new StacksMainnet();
      case 'testnet':
        return new StacksTestnet();
      default:
        throw new Error(`Invalid SUPPLIER_NETWORK: ${this.networkKey}`);
    }
  }

  get btcSigner() {
    return ECPair.fromWIF(this.btcSignerKey, this.btcNetwork);
  }

  get btcPrivateKey() {
    const signer = this.btcSigner;
    if (!signer.privateKey) throw new Error('Invalid private key in SUPPLIER_BTC_KEY');
    return signer.privateKey;
  }

  get publicKey() {
    return this.btcSigner.publicKey;
  }

  hasSupplierId() {
    return typeof this.supplierId !== 'undefined';
  }

  get btcPayment() {
    return payments.p2pkh({ pubkey: this.publicKey, network: this.btcNetwork });
  }

  get btcAddress() {
    const { address } = this.btcPayment;
    if (!address) throw new Error('Expected BTC address from config');
    return address;
  }

  get stxPrivateKey() {
    return this.stxSignerKey;
  }

  get stxNetworkVersion() {
    if (this.networkKey === 'mainnet') {
      return StacksNetworkVersion.mainnetP2PKH;
    }
    return StacksNetworkVersion.testnetP2PKH;
  }

  get stxAddress() {
    const networkVersion = this.stxNetworkVersion;
    return makeStxAddress(this.stxSignerKey, networkVersion);
  }

  get electrumConfig() {
    const networkKey = this.networkKey;
    const defaultHost = process.env.ELECTRUM_HOST;
    const defaultPort = process.env.ELECTRUM_PORT
      ? parseInt(process.env.ELECTRUM_PORT, 10)
      : undefined;
    const defaultProtocol = process.env.ELECTRUM_PROTOCOL;
    switch (networkKey) {
      case 'testnet':
        return {
          host: defaultHost || 'blackie.c3-soft.com',
          port: defaultPort === undefined ? 57006 : defaultPort,
          protocol: defaultProtocol || 'ssl',
        };
      case 'mocknet':
        return {
          host: 'localhost',
          port: 50001,
          protocol: 'tcp',
        };
      case 'mainnet':
        return {
          host: defaultHost || 'fortress.qtornado.com',
          port: defaultPort === undefined ? 443 : defaultPort,
          protocol: defaultProtocol || 'ssl',
        };
      default:
        return {
          host: process.env.ELECTRUM_HOST || 'localhost',
          port: parseInt(process.env.ELECTRUM_PORT || '50001', 10),
          protocol: process.env.ELECTRUM_PROTOCOL || 'ssl',
        };
    }
  }

  validateKeys() {
    return {
      btcAddress: this.btcAddress,
      stxAddress: this.stxAddress,
      btcNetwork: this.networkKey,
    };
  }

  validateConfig() {
    const keys = this.validateKeys();
    return {
      ...keys,
      supplierId: this.supplierId,
    };
  }

  logConfig(config: Record<string, string | number>) {
    // const electrumConfig = this.electrumConfig;
    logger.debug(
      { ...config, electrumConfig: this.electrumConfig, topic: 'start' },
      'Server config:'
    );
  }

  async validateKeysMatch() {
    const stxAddress = this.stxAddress;
    const btcAddress = this.btcAddress;
    let id: number;
    try {
      id = this.supplierId;
    } catch (error) {
      throw new Error('Cannot validate keys match: no supplier id');
    }

    const provider = stacksProvider();
    const supplier = await provider.ro(bridgeContract().getSupplier(id));
    if (supplier === null) throw new Error(`Invalid config: no supplier with id ${id}`);

    if (supplier.controller !== stxAddress) {
      throw new Error(`STX key invalid: expected ${supplier.controller} to equal ${stxAddress}`);
    }

    const supplierBtc = payments.p2pkh({
      pubkey: Buffer.from(supplier.publicKey),
      network: this.btcNetwork,
    }).address!;
    if (supplierBtc !== btcAddress) {
      throw new Error(`BTC key invalid: expected ${supplierBtc} to equal ${btcAddress}`);
    }
    return true;
  }
}

export function getEnv(key: string) {
  return ServerConfig.getEnv(key);
}

export function getBtcSigner() {
  return c().btcSigner;
}

export function getBtcPrivateKey() {
  return c().btcPrivateKey;
}

export function getPublicKey() {
  return c().publicKey;
}

export function getSupplierId() {
  return c().supplierId;
}

export function getBtcPayment() {
  return c().btcPayment;
}

export function getBtcAddress() {
  return c().btcAddress;
}

export function getStxPrivateKey() {
  return c().stxPrivateKey;
}

export function getStxNetworkVersion() {
  return c().stxNetworkVersion;
}

export function getStxAddress() {
  return c().stxAddress;
}

export function getNetworkKey() {
  return c().networkKey;
}

export function validateKeys() {
  return c().validateKeys();
}

// Fetch server config. Will throw an error if missing config.
export function validateConfig() {
  return c().validateConfig();
}

export type PublicConfig = ReturnType<typeof validateConfig>;

export function logConfig(config: Record<string, string | number>) {
  return c().logConfig(config);
}

export function getBtcNetwork(): networks.Network {
  return c().btcNetwork;
}

export function getStxNetwork(): StacksNetwork {
  return c().stxNetwork;
}

export function getElectrumConfig() {
  return c().electrumConfig;
}

export async function validateKeysMatch() {
  return c().validateKeysMatch();
}
