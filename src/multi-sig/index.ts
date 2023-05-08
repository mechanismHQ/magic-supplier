import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { ServerConfig } from '../config-v2';
import { wasOutboundSent, getOutboundSwapDetails } from './store';
import { getCurrentBlockHeight } from '../stacks-api';

export const PubKeys = [
  hex.decode('030000000000000000000000000000000000000000000000000000000000000001'),
  hex.decode('030000000000000000000000000000000000000000000000000000000000000002'),
  hex.decode('030000000000000000000000000000000000000000000000000000000000000003'),
];

export function getP2MS() {
  return btc.p2wsh(btc.p2ms(3, PubKeys));
}

export interface PsbtRequest {
  psbt: string;
  swapId: number;
}

export class MultiSigSigner {
  constructor(private config: ServerConfig) {}

  get pubKeys() {
    const { msPublicKeys } = this.config;
    if (typeof msPublicKeys === 'undefined') throw new Error('Missing public keys config');
    return msPublicKeys;
  }

  get p2ms() {
    return btc.p2wsh(btc.p2ms(2, this.pubKeys.map(hex.decode)));
  }

  async signPsbt(request: PsbtRequest) {
    const { psbt, swapId } = request;
    const tx = btc.Transaction.fromPSBT(hex.decode(psbt), { allowUnknowInput: true });
    await this.validate(tx, swapId);
    tx.signIdx(hex.decode(this.config.btcSignerKey), 0);
    return tx.toPSBT();
  }

  validateChange(tx: btc.Transaction) {
    const changeOutput = tx.getOutput(1);
    if (typeof changeOutput === 'undefined') throw new Error('Missing change output');

    if (hex.encode(changeOutput.script!) !== hex.encode(this.p2ms.script)) {
      throw new Error('Invalid change output');
    }
    if (tx.outputsLength !== 2) {
      throw new Error('Invalid number of outputs');
    }
  }

  async validateSwapNotSent(swapId: number) {
    if (await wasOutboundSent(swapId)) {
      throw new Error('Swap already sent');
    }
  }

  async validateMinimumConfirmations(swapId: number) {
    const swapDetails = await getOutboundSwapDetails(swapId);
    const currentHeight = await getCurrentBlockHeight();
    if (BigInt(currentHeight.stx) - swapDetails.createdAt < 6n) {
      throw new Error('Swap has not enough confirmations');
    }
  }

  async validate(tx: btc.Transaction, swapId: number) {
    this.validateChange(tx);
    await this.validateSwapNotSent(swapId);
    await this.validateMinimumConfirmations(swapId);
  }
}
