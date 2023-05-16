import { c } from '../../src/config';
import { secp256k1 } from '@noble/curves/secp256k1';
import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';

const config = c();
const basePub = config.publicKey;

const secondKey = secp256k1.utils.randomPrivateKey();
const secondPub = secp256k1.getPublicKey(secondKey);

const publicKeys = [basePub, secondPub].map(hex.encode).join(',');

console.log('Multi Sig public keys:');
console.log(publicKeys);
console.log('\nSecond signer key:');
console.log(hex.encode(secondKey));
