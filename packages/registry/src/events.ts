// Cross-process registry events over Postgres NOTIFY: workers announce what
// they processed, and every replica relays it to SSE clients and waiters.
import type { Database } from "./db/database.js";
import type { PublisherIdentity } from "./notifications/types.js";

export const EVENTS_CHANNEL = "registry_events";
export const JOBS_CHANNEL = "registry_jobs";

export type RegistryEvent =
  | {
      type: "version-ready";
      packageName: string;
      version: string;
      local: boolean;
      /** A publish subscribers hear about, not backfill or on-demand work */
      notify?: boolean;
      publishedBy?: PublisherIdentity;
    }
  | {
      type: "version-failed";
      packageName: string;
      version: string;
      error: string;
    }
  | {
      type: "versions-removed";
      packageName: string;
      /** null when the whole package is gone */
      versions: string[] | null;
      notify?: boolean;
      publishedBy?: PublisherIdentity;
    };

export class EventBus {
  #db: Database;
  #handlers = new Set<(event: RegistryEvent) => void>();
  #started: Promise<void> | undefined;

  constructor(db: Database) {
    this.#db = db;
  }

  start(): Promise<void> {
    this.#started ??= this.#db
      .listen(EVENTS_CHANNEL, (payload) => {
        let event: RegistryEvent;
        try {
          event = JSON.parse(payload) as RegistryEvent;
        } catch {
          return;
        }
        for (const handler of this.#handlers) handler(event);
      })
      .then(() => undefined);
    return this.#started;
  }

  on(handler: (event: RegistryEvent) => void): () => void {
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  }

  publish(event: RegistryEvent): Promise<void> {
    return this.#db.notify(EVENTS_CHANNEL, JSON.stringify(event));
  }
}
