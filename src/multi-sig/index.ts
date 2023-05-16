import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { ServerConfig } from '../config';
import { wasOutboundSent } from './store';
import { getOutboundSwapDetails, OutboundSwapDetails } from './fetchers';
import { getCurrentBlockHeight } from '../stacks-api';
import { equalBytes } from 'magic-protocol';

export interface PsbtRequest {
  psbt: string;
  swapId: number;
}

export class MultiSigSigner {
  constructor(
    private config: ServerConfig,
    public psbtHex: string,
    public swapId: number,
    public outboundSwapDetails: OutboundSwapDetails
  ) {}

  static async signPsbt(request: PsbtRequest, config: ServerConfig) {
    const details = await getOutboundSwapDetails(request.swapId);
    const signer = new MultiSigSigner(config, request.psbt, request.swapId, details);
    return signer.signPsbt();
  }

  get txFromPsbt() {
    return btc.Transaction.fromPSBT(hex.decode(this.psbtHex));
  }

  get p2ms() {
    const { msPublicKeys, minSigners } = this.config.multisigConfig;
    return btc.p2wsh(btc.p2ms(minSigners, msPublicKeys.map(hex.decode)));
  }

  async signPsbt() {
    const tx = this.txFromPsbt;
    await this.validate();
    tx.signIdx(this.config.btcPrivateKey, 0);
    return tx.toPSBT();
  }

  validateChange() {
    const tx = this.txFromPsbt;
    const changeOutput = tx.getOutput(1);
    if (typeof changeOutput === 'undefined') throw new Error('Missing change output');

    if (!equalBytes(changeOutput.script!, this.config.p2ms.script)) {
      throw new Error('Invalid change output');
    }
    if (tx.outputsLength !== 2) {
      throw new Error('Invalid number of outputs');
    }
  }

  validateRecipient() {
    const tx = this.txFromPsbt;
    const txOutput = tx.getOutput(0);
    const { output, sats } = this.outboundSwapDetails;
    if (!equalBytes(output, txOutput.script!)) {
      throw new Error('Invalid output script');
    }
    if (txOutput.amount !== sats) {
      throw new Error('Invalid output amount');
    }
  }

  async validateSwapNotSent() {
    if (await wasOutboundSent(this.swapId)) {
      throw new Error('Swap already sent');
    }
  }

  async validateMinimumConfirmations() {
    const swapDetails = await getOutboundSwapDetails(this.swapId);
    const currentHeight = await getCurrentBlockHeight();
    if (BigInt(currentHeight.stx) - swapDetails.createdAt < 6n) {
      throw new Error('Swap has not enough confirmations');
    }
  }

  async validate() {
    this.validateChange();
    // await this.validateSwapNotSent();
    // await this.validateMinimumConfirmations();
    // this.validateRecipient();
    return Promise.resolve();
  }
}
