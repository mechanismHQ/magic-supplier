import 'cross-fetch/polyfill';
import {
  getNetworkKey,
  c,
  logConfig,
  validateConfig,
  validateKeys,
  validateKeysMatch,
} from '../src/config';
import { getContracts } from '../src/stacks';
import { logger } from '../src/logger';
import { getBalances } from '../src/wallet';

async function run() {
  try {
    const config = c();
    if (config.hasSupplierId()) {
      const configKeys = config.validateConfig();
      config.logConfig(configKeys);
      await config.validateKeysMatch();
    } else {
      const configKeys = config.validateKeys();
      config.logConfig(configKeys);
      logger.debug('No SUPPLIER_ID - skipping supplier registration check.');
    }
    const contracts = getContracts();
    logger.debug(
      {
        bridge: contracts.magic.identifier,
        xbtc: contracts.wrappedBitcoin.identifier,
        network: config.networkKey,
        multisig: config.hasMultisig(),
      },
      'Configured contracts:'
    );
    const balances = await getBalances();
    logger.debug({
      btc: balances.btc.btc,
      stx: balances.stx.stx,
      xbtcFunds: balances.xbtc.xbtc,
      xbtcExternal: balances.stx.xbtc,
    });
  } catch (error) {
    logger.error(error);
  }
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
