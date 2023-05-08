import fp from 'fastify-plugin';
import { FastifyPluginAsync } from './api-types';
import { hex } from '@scure/base';
import { MultiSigSigner } from '../multi-sig';
import { z } from 'zod';

export const multiSigRouter: FastifyPluginAsync = fp(async server => {
  server.route({
    method: 'POST',
    url: '/multi-sig/sign-psbt',
    schema: {
      body: z.object({
        psbt: z.string(),
        swapId: z.number(),
      }),
    },
    handler: async (request, reply) => {
      const signer = new MultiSigSigner(server.config);
      const psbt = await signer.signPsbt(request.body);
      await reply.send({ psbt: hex.encode(psbt) });
    },
  });

  return Promise.resolve();
});
