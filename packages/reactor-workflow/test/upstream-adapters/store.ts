// Upstream's createContextStore over ours: a trigger context's ctx.store, the
// host's store handlers and the run journal's piece_store, as a durable hook runs them.
import type { Store } from "@powerhousedao/pieces-framework";
import type { KeyValueStore } from "../../src/pieces/activepieces/context/action.js";
import type { StoreScopeName } from "../../src/pieces/activepieces/context/store-scope.js";
import { buildTriggerContext } from "../../src/pieces/activepieces/context/trigger.js";
import { jsonSafe } from "../../src/pieces/activepieces/worker/json-safe.js";
import {
  STORE_DELETE,
  STORE_GET,
  STORE_PUT,
} from "../../src/pieces/activepieces/worker/protocol.js";
import { storeHandlers } from "../../src/pieces/engine/blocks.js";
import { createPieceStorePort } from "../../src/reactor/piece-store-port.js";
import { WorkflowRunStore } from "../../src/reactor/store.js";
import { createTestRelationalDb } from "../helpers/pglite.js";

interface StoreParams {
  prefix: string;
  flowId: string;
}

export interface StoreRowRef {
  scope: string;
  scopeKey: string;
  key: string;
}

let journal: Promise<WorkflowRunStore> | undefined;
const calls: StoreRowRef[] = [];

// The row each call reached, recorded where upstream's test reads the URL.
function recordingJournal(store: WorkflowRunStore): WorkflowRunStore {
  const record = (scope: string, scopeKey: string, key: string) =>
    calls.push({ scope, scopeKey, key });
  return new Proxy(store, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      const method = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        if (String(property).endsWith("PieceStoreValue")) {
          record(args[0] as string, args[1] as string, args[2] as string);
        }
        return method.apply(target, args);
      };
    },
  });
}

function openJournal(): Promise<WorkflowRunStore> {
  journal ??= WorkflowRunStore.create(createTestRelationalDb()).then(
    recordingJournal,
  );
  return journal;
}

// Each call crosses the host call channel's shape: what RemoteKeyValueStore
// sends in the worker, and what storeHandlers answers on the host.
function hostStore(flowId: string): KeyValueStore {
  const handlers = openJournal().then((store) =>
    storeHandlers(createPieceStorePort(store, () => flowId)),
  );
  const call = async (method: string, payload: unknown) =>
    (await handlers)[method](payload);
  return {
    async put(key, value, scope?: StoreScopeName) {
      const stored = jsonSafe(value);
      await call(STORE_PUT, { key, value: stored, scope });
      return stored;
    },
    get: (key, scope?: StoreScopeName) => call(STORE_GET, { key, scope }),
    async delete(key, scope?: StoreScopeName) {
      await call(STORE_DELETE, { key, scope });
    },
  };
}

// Ours partitions by (scope, flow) itself, so upstream's key prefix has no
// counterpart; a test hook's own partition replaces it.
export function createContextStore({ flowId }: StoreParams): Store {
  const { context } = buildTriggerContext({
    propsValue: {},
    store: hostStore(flowId),
    hostPartitionedStore: true,
    identity: { flowId },
  });
  return context.store;
}

// Seeds the row upstream's server would answer for `key`, which carries its
// flat layout: `<prefix>flow_<flowId>/<key>` for FLOW, `<prefix><key>` for PROJECT.
export async function seedStoreEntry(
  { key, value }: { key: string; value: unknown },
  { prefix, flowId }: StoreParams,
): Promise<void> {
  const flowPrefix = `${prefix}flow_${flowId}/`;
  const store = hostStore(flowId);
  if (key.startsWith(flowPrefix)) {
    await store.put(key.slice(flowPrefix.length), value, "FLOW");
  } else {
    await store.put(key.slice(prefix.length), value, "PROJECT");
  }
}

export function lastStoreCall(): StoreRowRef | undefined {
  return calls.at(-1);
}
