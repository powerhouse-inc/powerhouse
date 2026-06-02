import { DEFAULT_RELATIONAL_PROCESSOR_DB_NAME } from "@powerhousedao/shared/processors";
import { getStorageNamespace } from "@powerhousedao/shared/connect";
import { env } from "../connect.config.js";

// Single owner of the origin-scoped storage namespace. Resolved from the same
// base-path source connect.config.ts uses so every store agrees.
const basePath = env.PH_CONNECT_BASE_PATH || import.meta.env.BASE_URL;

// "reactor" at the root, "reactor--<slug>" under a path prefix.
export const STORAGE_NAMESPACE = getStorageNamespace(basePath);

// PGlite data-dir name for the reactor store, fed to `idb://`.
export const REACTOR_PGLITE_NAME = STORAGE_NAMESPACE;

// IdbFs name for the relational-processor worker store.
export const RELATIONAL_PGLITE_NAME =
  STORAGE_NAMESPACE === "reactor"
    ? DEFAULT_RELATIONAL_PROCESSOR_DB_NAME
    : `${STORAGE_NAMESPACE}-${DEFAULT_RELATIONAL_PROCESSOR_DB_NAME}`;
