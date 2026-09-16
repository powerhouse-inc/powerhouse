// Their StoreScope, as a name the host can partition on.
import { StoreScope } from "@powerhousedao/pieces-framework";

// The enum's PROJECT member carries the legacy value "COLLECTION", and an
// omitted scope means FLOW, so both are folded to one name here.
export type StoreScopeName = keyof typeof StoreScope;

// Compared by value, never by enum identity: a piece bundle inlines its own
// copy of StoreScope, and some pass the member name instead of its value.
export function normalizeStoreScope(scope?: unknown): StoreScopeName {
  return scope === StoreScope.PROJECT || scope === "PROJECT"
    ? "PROJECT"
    : "FLOW";
}
