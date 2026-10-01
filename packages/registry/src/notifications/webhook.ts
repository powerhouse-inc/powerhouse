import type { Database } from "../db/database.js";
import type { WebhookConfig } from "../types.js";
import type { PublishEvent, UnpublishEvent } from "./types.js";

// Webhooks registered through the API live in the database, shared by every
// replica; the ones from configuration are added to them.
export class WebhookStore {
  #db: Database;
  #predefined: WebhookConfig[];

  constructor(db: Database, predefined: WebhookConfig[] = []) {
    this.#db = db;
    this.#predefined = predefined;
  }

  async getWebhooks(): Promise<WebhookConfig[]> {
    const rows = await this.#db.query<{
      endpoint: string;
      headers: Record<string, string>;
    }>("SELECT endpoint, headers FROM registry_webhooks ORDER BY created_at");
    const stored = rows.rows.map((row) => ({
      endpoint: row.endpoint,
      ...(Object.keys(row.headers).length > 0 ? { headers: row.headers } : {}),
    }));
    return [
      ...this.#predefined,
      ...stored.filter(
        (w) => !this.#predefined.some((p) => p.endpoint === w.endpoint),
      ),
    ];
  }

  async addWebhook(webhook: WebhookConfig): Promise<void> {
    if (this.#predefined.some((w) => w.endpoint === webhook.endpoint)) return;
    await this.#db.query(
      `INSERT INTO registry_webhooks (endpoint, headers) VALUES ($1, $2)
       ON CONFLICT (endpoint) DO NOTHING`,
      [webhook.endpoint, JSON.stringify(webhook.headers ?? {})],
    );
  }

  async removeWebhook(endpoint: string): Promise<boolean> {
    const result = await this.#db.query<{ endpoint: string }>(
      "DELETE FROM registry_webhooks WHERE endpoint = $1 RETURNING endpoint",
      [endpoint],
    );
    return result.rows.length > 0;
  }

  async notifyPublish(event: PublishEvent): Promise<void> {
    await this.#post({ type: "publish", ...event });
  }

  async notifyUnpublish(event: UnpublishEvent): Promise<void> {
    await this.#post({ type: "unpublish", ...event });
  }

  async #post(body: Record<string, unknown>): Promise<void> {
    const webhooks = await this.getWebhooks();
    await Promise.all(
      webhooks.map((webhook) =>
        fetch(webhook.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...webhook.headers },
          body: JSON.stringify(body),
        }).catch((err: unknown) => {
          console.error(
            `[registry] Webhook to ${webhook.endpoint} failed:`,
            err,
          );
        }),
      ),
    );
  }
}
