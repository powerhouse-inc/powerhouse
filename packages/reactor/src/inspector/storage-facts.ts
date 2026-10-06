import type { ReactorStorageFacts } from "./types.js";

export const UNKNOWN_STORAGE_FACTS: ReactorStorageFacts = Object.freeze({
  engine: "unknown",
  persistence: "unknown",
  durable: false,
  selfHeal: false,
});

export const POSTGRES_STORAGE_FACTS: ReactorStorageFacts = Object.freeze({
  engine: "postgres",
  persistence: "server",
  durable: true,
  selfHeal: false,
});

export const IN_MEMORY_PGLITE_STORAGE_FACTS: ReactorStorageFacts =
  Object.freeze({
    engine: "pglite",
    persistence: "memory",
    durable: false,
    selfHeal: false,
  });
