import { z } from 'zod';

export const baseServerSchema = z.object({
  btcSignerKey: z.string(),
  supplierId: z.number(),
  stxSignerKey: z.string(),
  networkKey: z.string(),
  msPublicKeys: z.optional(z.array(z.string())),
  minSigners: z.optional(z.number()),
});

export const multisigConfigSchema = baseServerSchema.extend({
  minSigners: z.number(),
  msPublicKeys: z.array(z.string()),
});

export const serverConfigSchema = z.intersection(baseServerSchema, multisigConfigSchema);

export type ConfigInit = z.infer<typeof serverConfigSchema>;

export class ServerConfig {
  public btcSignerKey: string;
  public supplierId: number;
  public stxSignerKey: string;
  public networkKey: string;
  public msPublicKeys?: string[];
  public minSigners?: number;

  constructor(config: ConfigInit) {
    this.btcSignerKey = config.btcSignerKey;
    this.supplierId = config.supplierId;
    this.stxSignerKey = config.stxSignerKey;
    this.networkKey = config.networkKey;
    this.msPublicKeys = config.msPublicKeys;
    this.minSigners = config.minSigners;
  }

  static getEnv(key: string, required?: true): string;
  static getEnv(key: string, required: false): string | undefined;
  static getEnv(key: string, required = true) {
    const oldKey = key.replace(/^SUPPLIER/, 'OPERATOR');
    const value = process.env[oldKey] || process.env[key];
    if (required && !value) throw new Error(`Missing required ENV variable: ${key}`);
    return value;
  }

  static load(partialConfig?: Partial<ConfigInit>) {
    const btcSignerKey = partialConfig?.btcSignerKey || this.getEnv('SUPPLIER_BTC_KEY');
    const supplierId = partialConfig?.supplierId ?? parseInt(this.getEnv('SUPPLIER_ID'), 10);
    const stxSignerKey = partialConfig?.stxSignerKey || this.getEnv('SUPPLIER_STX_KEY');
    const networkKey = partialConfig?.networkKey || this.getEnv('SUPPLIER_NETWORK');
    const msPublicKeys =
      partialConfig?.msPublicKeys || process.env.SUPPLIER_MS_PUBLIC_KEYS?.split(',');
    const minSigners =
      partialConfig?.minSigners ??
      (msPublicKeys ? parseInt(this.getEnv('SUPPLIER_MIN_SIGNERS'), 10) : undefined);

    const config = serverConfigSchema.parse({
      btcSignerKey,
      supplierId,
      stxSignerKey,
      networkKey,
      msPublicKeys,
      minSigners,
    });

    return new ServerConfig(config);
  }

  get multisigConfig() {
    if (typeof this.msPublicKeys === 'undefined' || typeof this.minSigners === 'undefined') {
      throw new Error('Missing multi-sig configuration');
    }

    return {
      minSigners: this.minSigners,
      msPublicKeys: this.msPublicKeys,
    };
  }
}
