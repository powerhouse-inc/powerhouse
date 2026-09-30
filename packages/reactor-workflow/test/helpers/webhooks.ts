// The endpoint family as the reactor's webhook service shapes it, in memory.
import type {
  IWebhookEndpoints,
  IWebhookScope,
  WebhookEndpointInfo,
} from "@powerhousedao/shared/processors";
import { randomBytes } from "node:crypto";

export function memoryWebhooks() {
  const rows = new Map<string, WebhookEndpointInfo>();
  const endpoints: IWebhookEndpoints = {
    endpointFor: (key) => {
      let row = rows.get(key);
      if (!row) {
        const token = randomBytes(16).toString("hex");
        row = {
          key,
          token,
          url: `https://hooks.test/webhooks/${token}`,
          createdAt: new Date().toISOString(),
        };
        rows.set(key, row);
      }
      const { key: _, ...info } = row;
      return Promise.resolve(info);
    },
    revoke: (key) => {
      rows.delete(key);
      return Promise.resolve();
    },
    list: () => Promise.resolve([...rows.values()]),
  };
  const scope: IWebhookScope = {
    hasPublicOrigin: true,
    register: () => Promise.resolve(endpoints),
  };
  return { rows, scope };
}
