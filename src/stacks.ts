import { ClarigenNodeClient } from '@clarigen/node';
import { projectFactory, DEPLOYMENT_NETWORKS, ClarigenClient } from '@clarigen/core';
import { getNetworkKey, getStxNetwork, getStxPrivateKey } from './config';
import { bytesToHex } from 'micro-stacks/common';
import { project } from './clarigen/next';
import { createAssetInfo } from 'micro-stacks/transactions';

export function getContracts() {
  return projectFactory(project, getProjectNetworkKey() as unknown as 'devnet');
}

export type Contracts = ReturnType<typeof getContracts>;
export type BridgeContract = Contracts['magic'];

type NetworkKey = typeof DEPLOYMENT_NETWORKS[number];
function getProjectNetworkKey(): NetworkKey {
  const key = getNetworkKey();
  if (key === 'mocknet') return 'devnet';
  for (const type of DEPLOYMENT_NETWORKS) {
    if (type === key) return key;
  }
  throw new Error(
    `Invalid SUPPLIER_NETWORK config. Valid values are ${DEPLOYMENT_NETWORKS.join(',')}`
  );
}

export function stacksProvider() {
  return new ClarigenClient(getStxNetwork());
}

export function bridgeContract() {
  return getContracts().magic;
}

export function xbtcContract() {
  return getContracts().wrappedBitcoin;
}

export function xbtcAssetId() {
  const contract = xbtcContract();
  const asset = contract.fungible_tokens[0].name;
  return `${contract.identifier}::${asset}`;
}

export function xbtcAssetInfo() {
  const contract = getContracts().wrappedBitcoin;
  const token = contract.fungible_tokens[0].name;
  const [address, name] = contract.identifier.split('.');
  return createAssetInfo(address, name, token);
}

export async function getOutboundFinalizedTxid(swapId: bigint | number) {
  const provider = stacksProvider();
  const txid = await provider.ro(bridgeContract().getCompletedOutboundSwapTxid(swapId));
  return txid ? bytesToHex(txid) : null;
}

export async function getOutboundSwap(swapId: bigint) {
  const client = stacksProvider();
  const swap = await client.ro(bridgeContract().getOutboundSwap(swapId));
  return swap;
}
