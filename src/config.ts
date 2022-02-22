import { ECPair, networks, payments } from 'bitcoinjs-lib';
import { privateKeyToStxAddress, StacksNetworkVersion } from 'micro-stacks/crypto';
import { StacksMainnet, StacksMocknet, StacksNetwork, StacksTestnet } from 'micro-stacks/network';
import { getPublicKey as _getPublicKey } from 'noble-secp256k1';
import { accounts } from '../src/clarigen';
import { logger } from './logger';

export function getEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required ENV variable: ${key}`);
  return value;
}

export function getBtcSigner() {
  const network = getBtcNetwork();
  return ECPair.fromWIF(getEnv('OPERATOR_BTC_KEY'), network);
}

export function getBtcPrivateKey() {
  const signer = getBtcSigner();
  if (!signer.privateKey) throw new Error('Invalid private key in OPERATOR_BTC_KEY');
  return signer.privateKey;
}

export function getPublicKey() {
  const signer = getBtcSigner();
  return signer.publicKey;
}

export function getOperatorId() {
  const id = parseInt(getEnv('OPERATOR_ID'), 10);
  if (isNaN(id)) throw new Error('OPERATOR_ID is not a number');
  return id;
}

export function getBtcPayment() {
  const pubkey = getPublicKey();
  const network = getBtcNetwork();
  return payments.p2pkh({ pubkey, network });
}

export function getBtcAddress() {
  const { address } = getBtcPayment();
  if (!address) throw new Error('Expected BTC address from config.');
  return address;
}

export function getContractAddress() {
  const networkKey = getNetworkKey();
  switch (networkKey) {
    case 'mocknet':
      return accounts.deployer.address;
    case 'mainnet':
      throw new Error('No known contract address for mainnet');
    case 'testnet':
      return 'ST1VSQJ1BGM3DF6F28PKJR8P4SYDMFAT5CZNGG9YT';
    default:
      throw new Error(`Invalid OPERATOR_NETWORK: ${networkKey}`);
  }
}

export function getStxPrivateKey() {
  return getEnv('OPERATOR_STX_KEY');
}

export function getCompressedKey(key: string) {
  if (key.length === 66) {
    const compressed = key.slice(64);
    return {
      key: key.slice(0, 64),
      isCompressed: compressed === '01',
    };
  }
  return { key, isCompressed: true };
}

export function getStxAddress() {
  const { key, isCompressed } = getCompressedKey(getStxPrivateKey());
  return privateKeyToStxAddress(key, StacksNetworkVersion.testnetP2PKH, isCompressed);
}

export function getNetworkKey() {
  return getEnv('OPERATOR_NETWORK');
}

// Fetch server config. Will throw an error if missing config.
export function validateConfig() {
  return {
    btcAddress: getBtcAddress(),
    operatorId: getOperatorId(),
    stxAddress: getStxAddress(),
    btcNetwork: getNetworkKey(),
  };
}

export type PublicConfig = ReturnType<typeof validateConfig>;

export function logConfig(config: PublicConfig) {
  const message: string[] = ['Server config:'];
  let k: keyof typeof config;
  const electrumConfig = getElectrumConfig();
  for (k in config) {
    message.push(`${k}: ${config[k]}`);
  }
  message.push(`Electrum host: ${electrumConfig.host}`);
  message.push(`Electrum port: ${electrumConfig.port}`);
  message.push(`Electrum protocol: ${electrumConfig.protocol}`);
  logger.debug(message.join('\n'));
}

export function getBtcNetwork(): networks.Network {
  const networkKey = getNetworkKey();
  switch (networkKey) {
    case 'mocknet':
      return networks.regtest;
    case 'mainnet':
      return networks.bitcoin;
    case 'testnet':
      return networks.testnet;
    default:
      throw new Error(`Invalid OPERATOR_NETWORK: ${networkKey}`);
  }
}

export function getStxNetwork(): StacksNetwork {
  const networkKey = getNetworkKey();
  switch (networkKey) {
    case 'mocknet':
      return new StacksMocknet();
    case 'mainnet':
      return new StacksMainnet();
    case 'testnet':
      return new StacksTestnet();
    default:
      throw new Error(`Invalid OPERATOR_NETWORK: ${networkKey}`);
  }
}

export function getElectrumConfig() {
  const networkKey = getNetworkKey();
  const defaultHost = process.env.ELECTRUM_HOST;
  const defaultPort = process.env.ELECTRUM_PORT
    ? parseInt(process.env.ELECTRUM_PORT, 10)
    : undefined;
  const defaultProtocol = process.env.ELECTRUM_PROTOCOL;
  switch (networkKey) {
    case 'testnet':
      return {
        host: defaultHost || 'electrum.blockstream.info',
        port: defaultPort === undefined ? 60001 : defaultPort,
        protocol: defaultProtocol || 'tcp',
      };
    case 'mocknet':
      return {
        host: 'localhost',
        port: 50001,
        protocol: 'tcp',
      };
    default:
      return {
        host: process.env.ELECTRUM_HOST || 'localhost',
        port: parseInt(process.env.ELECTRUM_PORT || '50001', 10),
        protocol: process.env.ELECTRUM_PROTOCOL || 'ssl',
      };
  }
}