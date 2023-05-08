import type {
  FastifyInstance,
  FastifyBaseLogger,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  FastifyPluginCallback,
  FastifyPluginAsync as FastifyPluginAsyncBase,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export type FastifyServer = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export type FastifyPlugin = FastifyPluginCallback<
  Record<any, any>,
  RawServerDefault,
  ZodTypeProvider
>;

export type FastifyPluginAsync<T extends Record<any, any> = Record<any, any>> =
  FastifyPluginAsyncBase<T, RawServerDefault, ZodTypeProvider>;
