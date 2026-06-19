import { DEFAULT_RELATIONAL_PROCESSOR_DB_NAME } from "@powerhousedao/shared/processors";
import { ROOT_STORAGE_NAMESPACE } from "@powerhousedao/shared/connect";
import { PH_CONNECT_BASE_PATH } from "../connect.config.js";
import { getRuntimeConfig } from "../runtime-config.js";
import { resolveReactorNamespace } from "./reactor-namespace.js";

export const REACTOR_INSTANCE_NAMESPACE = resolveReactorNamespace({
  basePath: PH_CONNECT_BASE_PATH,
  explicit: getRuntimeConfig().connect.instance?.namespace ?? undefined,
});

export const REACTOR_PGLITE_NAME = REACTOR_INSTANCE_NAMESPACE;

export const RELATIONAL_PGLITE_NAME =
  REACTOR_INSTANCE_NAMESPACE === ROOT_STORAGE_NAMESPACE
    ? DEFAULT_RELATIONAL_PROCESSOR_DB_NAME
    : `${REACTOR_INSTANCE_NAMESPACE}-${DEFAULT_RELATIONAL_PROCESSOR_DB_NAME}`;

// Here, not pglite-idb.ts, so those IDB helpers stay free of runtime-config
// and remain importable by the reactor SharedWorker.
export const REACTOR_IDB_NAME = `/pglite/${REACTOR_PGLITE_NAME}`;
export const RELATIONAL_IDB_NAME = `/pglite/${RELATIONAL_PGLITE_NAME}`;
export const PRIMARY_IDB_NAMES = [
  REACTOR_IDB_NAME,
  RELATIONAL_IDB_NAME,
] as const;
