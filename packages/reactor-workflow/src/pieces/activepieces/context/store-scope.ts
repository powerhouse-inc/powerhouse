// Their StoreScope, as a name the host can partition on.

// The enum's PROJECT member carries the legacy value "COLLECTION", and an
// omitted scope means FLOW, so both are folded to one name here.
export type StoreScopeName = "FLOW" | "PROJECT";

export function normalizeStoreScope(scope?: unknown): StoreScopeName {
  return scope === "COLLECTION" || scope === "PROJECT" ? "PROJECT" : "FLOW";
}
