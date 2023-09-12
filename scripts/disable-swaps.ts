import 'cross-fetch/polyfill';
import { prompt } from 'inquirer';
import { getSupplierId } from '../src/config';
import { bridgeContract, stacksProvider } from '../src/stacks';
import { broadcastAndLog, confirm } from './helpers';

interface Enabled {
  inbound: boolean;
  outbound: boolean;
}

async function run() {
  const provider = stacksProvider();
  const bridge = bridgeContract();

  const supplierId = getSupplierId();
  const supplier = await provider.ro(bridge.getSupplier(supplierId), { tip: 'latest' });

  if (supplier === null) {
    throw new Error(`Supplier ID (${supplierId}) invalid`);
  }

  const enabled = await prompt<Enabled>([
    {
      name: 'inbound',
      type: 'confirm',
      message: 'Enabled inbound swaps?',
    },
    {
      name: 'outbound',
      type: 'confirm',
      message: 'Enabled outbound swaps?',
    },
  ]);

  console.log('You will update your supplier to enable:');
  console.log(`Inbound swaps: ${enabled.inbound ? 'Yes' : 'No'}`);
  console.log(`Outbound swaps: ${enabled.outbound ? 'Yes' : 'No'}`);

  await confirm();
  const tx = bridge.updateSupplierFees({
    inboundBaseFee: supplier.inboundBaseFee,
    inboundFee: enabled.inbound ? supplier.inboundFee : null,
    outboundBaseFee: supplier.outboundBaseFee,
    outboundFee: enabled.outbound ? supplier.outboundFee : null,
  });

  await broadcastAndLog(tx, {});
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
