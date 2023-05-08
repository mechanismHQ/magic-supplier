import { z } from 'zod';

export const serverConfigSchema = z.object({
  btcSignerKey: z.string(),
  supplierId: z.number(),
  stxSignerKey: z.string(),
  networkKey: z.string(),
  msPublicKeys: z.optional(z.array(z.string())),
});

export type ConfigInit = z.infer<typeof serverConfigSchema>;

export class ServerConfig {
  public btcSignerKey: string;
  public supplierId: number;
  public stxSignerKey: string;
  public networkKey: string;
  public msPublicKeys?: string[];

  constructor(config: ConfigInit) {
    this.btcSignerKey = config.btcSignerKey;
    this.supplierId = config.supplierId;
    this.stxSignerKey = config.stxSignerKey;
    this.networkKey = config.networkKey;
    this.msPublicKeys = config.msPublicKeys;
  }

  static getEnv(key: string) {
    const oldKey = key.replace(/^SUPPLIER/, 'OPERATOR');
    const value = process.env[oldKey] || process.env[key];
    if (!value) throw new Error(`Missing required ENV variable: ${key}`);
    return value;
  }

  static load(partialConfig?: Partial<ConfigInit>) {
    const btcSignerKey = partialConfig?.btcSignerKey || this.getEnv('SUPPLIER_BTC_KEY');
    const supplierId = partialConfig?.supplierId ?? parseInt(this.getEnv('SUPPLIER_ID'), 10);
    const stxSignerKey = partialConfig?.stxSignerKey || this.getEnv('SUPPLIER_STX_KEY');
    const networkKey = partialConfig?.networkKey || this.getEnv('SUPPLIER_NETWORK');
    const msPublicKeys =
      partialConfig?.msPublicKeys || process.env.SUPPLIER_MS_PUBLIC_KEYS?.split(',');

    const config = serverConfigSchema.parse({
      btcSignerKey,
      supplierId,
      stxSignerKey,
      networkKey,
      msPublicKeys,
    });

    return new ServerConfig(config);
  }
}
