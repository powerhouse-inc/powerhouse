import fs from "node:fs";
import path from "node:path";
import type { NotifyConfig, WebhookConfig } from "../types.js";
import type { NotificationChannel, PublishEvent } from "./types.js";

const WEBHOOKS_FILE = "webhooks.json";

export class WebhookChannel implements NotificationChannel {
  #predefined: WebhookConfig[];
  #dynamic: WebhookConfig[];
  #storagePath: string;

  constructor(storagePath: string, config?: NotifyConfig) {
    this.#storagePath = storagePath;
    this.#predefined = config?.webhooks ?? [];
    this.#dynamic = this.#load();
  }

  getWebhooks(): WebhookConfig[] {
    return [...this.#predefined, ...this.#dynamic];
  }

  addWebhook(webhook: WebhookConfig): void {
    const exists = this.getWebhooks().some(
      (w) => w.endpoint === webhook.endpoint,
    );
    if (exists) return;
    this.#dynamic.push(webhook);
    this.#save();
  }

  removeWebhook(endpoint: string): boolean {
    const before = this.#dynamic.length;
    this.#dynamic = this.#dynamic.filter((w) => w.endpoint !== endpoint);
    if (this.#dynamic.length === before) return false;
    this.#save();
    return true;
  }

  notifyPublish(event: PublishEvent): void {
    for (const webhook of this.getWebhooks()) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...webhook.headers,
      };

      fetch(webhook.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(event),
      }).catch((err: unknown) => {
        console.error(`[registry] Webhook to ${webhook.endpoint} failed:`, err);
      });
    }
  }

  #filePath(): string {
    return path.join(this.#storagePath, WEBHOOKS_FILE);
  }

  #load(): WebhookConfig[] {
    try {
      const raw = fs.readFileSync(this.#filePath(), "utf-8");
      return JSON.parse(raw) as WebhookConfig[];
    } catch {
      return [];
    }
  }

  #save(): void {
    fs.mkdirSync(this.#storagePath, { recursive: true });
    fs.writeFileSync(this.#filePath(), JSON.stringify(this.#dynamic, null, 2));
  }
}
