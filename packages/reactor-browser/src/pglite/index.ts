// Re-export electric-sql types and utilities for consuming packages
export { PGliteWorker, worker } from "@electric-sql/pglite/worker";
export type { PGliteWorkerOptions } from "@electric-sql/pglite/worker";

export { IdbFs, PGlite } from "@electric-sql/pglite";

// TODO: export only live from electric-sql/pglite/live
export * from "@electric-sql/pglite/live";

export * from "./hooks/index.js";
export * from "./utils/index.js";

