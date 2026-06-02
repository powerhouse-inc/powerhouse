import { DEFAULT_RELATIONAL_PROCESSOR_DB_NAME } from "@powerhousedao/shared/processors";
import {
  getStorageNamespace,
  ROOT_STORAGE_NAMESPACE,
} from "@powerhousedao/shared/connect";
import { PH_CONNECT_BASE_PATH } from "../connect.config.js";

// Single owner of the origin-scoped storage namespace. Reuses the same
// resolved base path connect.config.ts feeds the router so every store agrees.
const basePath = PH_CONNECT_BASE_PATH;

// "reactor" at the root, "reactor--<slug>" under a path prefix.
export const STORAGE_NAMESPACE = getStorageNamespace(basePath);

// PGlite data-dir name for the reactor store, fed to `idb://`.
export const REACTOR_PGLITE_NAME = STORAGE_NAMESPACE;

// IdbFs name for the relational-processor worker store.
export const RELATIONAL_PGLITE_NAME =
  STORAGE_NAMESPACE === ROOT_STORAGE_NAMESPACE
    ? DEFAULT_RELATIONAL_PROCESSOR_DB_NAME
    : `${STORAGE_NAMESPACE}-${DEFAULT_RELATIONAL_PROCESSOR_DB_NAME}`;
