// TODO:
export async function wasOutboundSent(_swapId: number | bigint) {
  return Promise.resolve(false);
}

export interface OutboundSwapDetails {
  sats: bigint;
  swapId: bigint;
  output: Uint8Array;
  createdAt: bigint;
}

export async function getOutboundSwapDetails(
  _swapId: number | bigint
): Promise<OutboundSwapDetails> {
  return Promise.resolve({
    sats: 0n,
    swapId: 0n,
    output: new Uint8Array(0),
    createdAt: 0n,
  });
}
