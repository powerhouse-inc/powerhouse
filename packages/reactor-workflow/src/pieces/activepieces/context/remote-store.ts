// `ctx.store` served by the host, one call per operation, so a value a piece
// writes is durable the moment it writes it rather than when the step ends.

// This is the semantic Activepieces pieces are written against — theirs is an
// HTTP call per get/put/delete — so a loop that checkpoints its cursor resumes.
import type { KeyValueStore } from "./action.js";
import type { StoreScopeName } from "./store-scope.js";
import {
  STORE_DELETE,
  STORE_GET,
  STORE_PUT,
} from "../worker/protocol.js";
import { callHost } from "../worker/host-call.js";

export class RemoteKeyValueStore implements KeyValueStore {
  async put(
    key: string,
    value: unknown,
    scope?: StoreScopeName,
  ): Promise<unknown> {
    await callHost(STORE_PUT, { key, value, scope });
    return value;
  }

  get(key: string, scope?: StoreScopeName): Promise<unknown> {
    return callHost(STORE_GET, { key, scope });
  }

  async delete(key: string, scope?: StoreScopeName): Promise<void> {
    await callHost(STORE_DELETE, { key, scope });
  }
}
