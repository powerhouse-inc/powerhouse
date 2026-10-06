import type { ISyncAdmin } from "../sync/interfaces.js";
import type { ISyncInspector } from "../sync/sync-inspection.js";
import type {
  IInspector,
  IInspectorAdmin,
  InspectorAccess,
  IReactorDbQuery,
} from "./types.js";

/** Reads serve every caller a transport admits; admin and sql need access. */
export type InspectorTier = "read" | "admin" | "sql";

/** Only a read op has a GraphQL root field. */
export type InspectorOpSpec =
  | { readonly rpc: string; readonly tier: "read"; readonly gql: string }
  | { readonly rpc: string; readonly tier: "admin" | "sql" };

/** The `inspector-op` channel, one row per member. */
export const INSPECTOR_OPS = {
  info: { rpc: "reactor.info", tier: "read", gql: "info" },
  listDocumentModels: {
    rpc: "registry.listDocumentModels",
    tier: "read",
    gql: "documentModels",
  },
  listDrives: { rpc: "drives.list", tier: "read", gql: "drives" },
  checkDriveIntegrity: {
    rpc: "drives.checkIntegrity",
    tier: "read",
    gql: "driveIntegrity",
  },
  getAttachmentInfo: {
    rpc: "attachments.info",
    tier: "read",
    gql: "attachmentInfo",
  },
  getQueueState: { rpc: "queue.getState", tier: "read", gql: "queueState" },
  getProcessors: { rpc: "processors.getAll", tier: "read", gql: "processors" },
  getCatchUpStatus: {
    rpc: "catchUp.status",
    tier: "read",
    gql: "catchUpStatus",
  },
  getStorageHealth: {
    rpc: "storage.health",
    tier: "read",
    gql: "storageHealth",
  },
  validateDocument: {
    rpc: "integrity.validate",
    tier: "read",
    gql: "validateDocument",
  },
  pauseQueue: { rpc: "queue.pause", tier: "admin" },
  resumeQueue: { rpc: "queue.resume", tier: "admin" },
  retryProcessor: { rpc: "processors.retry", tier: "admin" },
  sweepCatchUp: { rpc: "catchUp.sweepNow", tier: "admin" },
  rebuildKeyframes: { rpc: "integrity.rebuildKeyframes", tier: "admin" },
  rebuildSnapshots: { rpc: "integrity.rebuildSnapshots", tier: "admin" },
  queryDb: { rpc: "db.query", tier: "sql" },
} as const satisfies {
  readonly [
    K in keyof IInspector | keyof IInspectorAdmin | keyof IReactorDbQuery
  ]: InspectorOpSpec;
};

/** The inspection and repair rows of the `sync-op` channel. */
export const SYNC_INSPECTION_OPS = {
  inspectRemote: { rpc: "inspect.remote", tier: "read", gql: "remote" },
  inspectRemotes: { rpc: "inspect.remotes", tier: "read", gql: "remotes" },
  listDeadLetters: {
    rpc: "deadLetters.list",
    tier: "read",
    gql: "deadLetters",
  },
  resetChannel: { rpc: "repair.resetChannel", tier: "admin" },
  requeueDeadLetter: { rpc: "deadLetters.requeue", tier: "admin" },
  clearDeadLetter: { rpc: "deadLetters.clear", tier: "admin" },
} as const satisfies {
  readonly [K in keyof ISyncInspector | keyof ISyncAdmin]: InspectorOpSpec;
};

export type InspectorOpKey = keyof typeof INSPECTOR_OPS;
export type SyncInspectionOpKey = keyof typeof SYNC_INSPECTION_OPS;

type ReadKeys<T> = {
  [K in keyof T]: T[K] extends { readonly tier: "read" } ? K : never;
}[keyof T];

export type InspectorReadOpKey = ReadKeys<typeof INSPECTOR_OPS>;
export type SyncInspectionReadOpKey = ReadKeys<typeof SYNC_INSPECTION_OPS>;

/** Reads only, unless a host grants more. */
export const READ_ONLY_ACCESS: InspectorAccess = Object.freeze({
  admin: false,
  sql: false,
});

export function tierAllowed(
  tier: InspectorTier,
  access: InspectorAccess,
): boolean {
  switch (tier) {
    case "read":
      return true;
    case "admin":
      return access.admin;
    case "sql":
      return access.sql;
  }
}

/** The table key whose rpc name is `method`, or undefined. */
export function opKeyOf<K extends string>(
  table: Readonly<Record<K, InspectorOpSpec>>,
  method: string,
): K | undefined {
  for (const key of Object.keys(table) as K[]) {
    if (table[key].rpc === method) {
      return key;
    }
  }
  return undefined;
}

/** The read rows' GraphQL root field names, keyed by member. */
export function readOpFields<K extends string>(
  table: Readonly<Record<K, InspectorOpSpec>>,
): Partial<Record<K, string>> {
  const fields: Partial<Record<K, string>> = {};
  for (const key of Object.keys(table) as K[]) {
    const spec = table[key];
    if (spec.tier === "read") {
      fields[key] = spec.gql;
    }
  }
  return fields;
}

export class UnknownInspectorOpError extends Error {
  constructor(readonly method: string) {
    super(`Unknown inspector op: ${method}`);
    this.name = "UnknownInspectorOpError";
  }
}

export class InspectorOpRefusedError extends Error {
  constructor(
    readonly method: string,
    readonly tier: InspectorTier,
  ) {
    super(`This host does not serve ${tier}-tier inspection ops (${method})`);
    this.name = "InspectorOpRefusedError";
  }
}

export class InspectorOpUnavailableError extends Error {
  constructor(readonly method: string) {
    super(`This host has nothing to serve ${method} with`);
    this.name = "InspectorOpUnavailableError";
  }
}

type OpHandler = (...args: unknown[]) => unknown;

/** Refuses unknown methods and ungranted tiers before resolving a handler. */
export async function dispatchTableOp<K extends string>(
  table: Readonly<Record<K, InspectorOpSpec>>,
  resolve: (key: K) => OpHandler | undefined,
  access: InspectorAccess,
  method: string,
  args: readonly unknown[],
): Promise<unknown> {
  const key = opKeyOf(table, method);
  if (key === undefined) {
    throw new UnknownInspectorOpError(method);
  }
  const tier = table[key].tier;
  if (!tierAllowed(tier, access)) {
    throw new InspectorOpRefusedError(method, tier);
  }
  const handler = resolve(key);
  if (!handler) {
    throw new InspectorOpUnavailableError(method);
  }
  const result = await handler(...args);
  return result;
}

/** Binds `key` on `target` when it is a method there. */
export function methodOf(target: object | undefined, key: string) {
  const member = (target as Record<string, unknown> | undefined)?.[key];
  return typeof member === "function"
    ? (member as OpHandler).bind(target)
    : undefined;
}
