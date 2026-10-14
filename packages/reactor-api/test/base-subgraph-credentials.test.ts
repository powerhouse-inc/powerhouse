import { describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import type { ICredentialInvalidator } from "../src/services/auth.service.js";

function subgraph(credentials?: ICredentialInvalidator): BaseSubgraph {
  return new BaseSubgraph({
    reactorClient: {},
    credentials,
  } as unknown as SubgraphArgs);
}

describe("BaseSubgraph.credentials", () => {
  it("forwards a package's invalidation to the host", () => {
    const invalidateCredential = vi.fn(() => 2);
    const sg = subgraph({ invalidateCredential });

    expect(sg.credentials.invalidateCredential("0xuser", 1, "did:key:a")).toBe(
      2,
    );
    expect(invalidateCredential).toHaveBeenCalledWith("0xuser", 1, "did:key:a");
  });

  // A host built before the hook existed passes nothing; packages must not
  // have to null-check it.
  it("is a no-op when the host provides no invalidator", () => {
    expect(subgraph().credentials.invalidateCredential("0xuser")).toBe(0);
  });
});
