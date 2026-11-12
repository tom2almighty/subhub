import { subscriptionPathsSchema } from '@subhub/shared';
import type { FastifyInstance } from 'fastify';
import { getSubscriptionPaths, updateSubscriptionPaths } from '../services/settings-service.js';

export default function registerSettingsRoutes(app: FastifyInstance): void {
  app.get('/api/settings', async () => getSubscriptionPaths());

  app.patch('/api/settings', async (request) => {
    const input = subscriptionPathsSchema.parse(request.body);
    return updateSubscriptionPaths(input);
  });
}
