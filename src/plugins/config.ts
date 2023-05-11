import fp from 'fastify-plugin';
import { FastifyPlugin, FastifyPluginAsync } from '../routes/api-types';
import { ConfigInit, ServerConfig } from '../config';
// import { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    config: ServerConfig;
  }
}

export const ConfigPlugin: FastifyPluginAsync<Partial<ConfigInit>> = fp(
  async (server, partialConfig) => {
    const config = ServerConfig.load(partialConfig);
    server.decorate('config', config);
    return Promise.resolve();
  }
);
