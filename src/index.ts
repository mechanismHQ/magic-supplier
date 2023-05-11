import Fastify from 'fastify';
import BasicAuth, { FastifyBasicAuthOptions } from '@fastify/basic-auth';
import { logger } from './logger';
import { bullRoute } from './routes/bull-adapter';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConfigInit } from './config';
import { ConfigPlugin } from './plugins/config';
import { multiSigRouter } from './routes/multi-sig-router';

export const validate: FastifyBasicAuthOptions['validate'] = async (username, password) => {
  const key = process.env.WEB_UI_PASSWORD;
  if (!key) return Promise.resolve();
  if (password !== key) {
    throw new Error('Invalid password.');
  }
  return Promise.resolve();
};

export const api = async (config?: Partial<ConfigInit>) => {
  const server = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  await server.register(ConfigPlugin, config);

  await server.register(BasicAuth, { validate });

  await server.register(multiSigRouter);

  server.setErrorHandler((err, req, reply) => {
    logger.error(err);
    if (err instanceof Error) {
      logger.error(err.stack);
      void reply.status(500).send({ status: 'error' });
      return;
    }
    void reply.status(500).send({ status: 'error' });
    return;
  });

  await server.register(bullRoute().registerPlugin());

  return server;
};
