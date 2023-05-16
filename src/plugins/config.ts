import fp from 'fastify-plugin';
import { FastifyPlugin, FastifyPluginAsync } from '../routes/api-types';
import { ConfigInit, ServerConfig } from '../config';
import { logger } from '../logger';
// import { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    config: ServerConfig;
  }
}

export const ConfigPlugin: FastifyPluginAsync<Partial<ConfigInit>> = fp(
  async (server, partialConfig) => {
    const config = ServerConfig.load(partialConfig, false);
    config.validateConfig();
    await config.validateKeysMatch();
    server.decorate('config', config);
    logger.debug({ topic: 'config', ...config.validateKeys() });
  }
);
