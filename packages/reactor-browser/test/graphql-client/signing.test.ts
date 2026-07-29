import type {
  Action,
  ISigner,
  PHDocument,
  Signature,
} from "@powerhousedao/shared/document-model";
import { hashDocumentStateForScope } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import {
  signStampedAction,
  stampAction,
} from "../../src/graphql-client/signing.js";

const state = { global: { name: "hello" }, local: {} };

function createDocument(revision: Record<string, number>): PHDocument {
  return {
    header: {
      id: "doc-1",
      sig: { publicKey: {}, nonce: "" },
      documentType: "powerhouse/test",
      createdAtUtcIso: "2026-01-01T00:00:00.000Z",
      slug: "my-doc",
      name: "My Doc",
      branch: "main",
      revision,
      lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
    },
    state,
    initialState: state,
    operations: {},
    clipboard: [],
  } as unknown as PHDocument;
}

const action: Action = {
  id: "action-1",
  type: "SET_NAME",
  timestampUtcMs: "1700000007000",
  input: { name: "world" },
  scope: "global",
};

const signature: Signature = ["ts", "did", "hash", "prev", "0xsig"];

function createSigner(): ISigner {
  return {
    user: { address: "0x1", networkId: "eip155", chainId: 1 },
    app: { name: "test-app", key: "app-key" },
    signAction: vi.fn().mockResolvedValue(signature),
  } as unknown as ISigner;
}

describe("stampAction", () => {
  it("stamps the scope state hash and the previous operation index", () => {
    const stamped = stampAction(action, createDocument({ global: 7 }));

    expect(stamped.context?.prevOpHash).toBe(
      hashDocumentStateForScope({ state }, "global"),
    );
    expect(stamped.context?.prevOpIndex).toBe(6);
  });

  it("stamps -1 for a scope with no operations", () => {
    const stamped = stampAction(action, createDocument({ global: 0 }));

    expect(stamped.context?.prevOpIndex).toBe(-1);
  });

  it("stamps -1 for a scope the document does not know about", () => {
    const stamped = stampAction(
      { ...action, scope: "local" },
      createDocument({ global: 7 }),
    );

    expect(stamped.context?.prevOpIndex).toBe(-1);
    expect(stamped.context?.prevOpHash).toBe(
      hashDocumentStateForScope({ state }, "local"),
    );
  });

  it("does not mutate the input action", () => {
    stampAction(action, createDocument({ global: 7 }));

    expect(action.context).toBeUndefined();
  });

  it("keeps an existing signer on the context", () => {
    const withSigner: Action = {
      ...action,
      context: {
        signer: {
          user: { address: "0x1", networkId: "eip155", chainId: 1 },
          app: { name: "app", key: "key" },
          signatures: [],
        },
      },
    };

    const stamped = stampAction(withSigner, createDocument({ global: 7 }));

    expect(stamped.context?.signer?.app.name).toBe("app");
  });
});

describe("signStampedAction", () => {
  it("appends the signature under the signer identity", async () => {
    const signer = createSigner();
    const stamped = stampAction(action, createDocument({ global: 7 }));
    const signed = await signStampedAction(stamped, signer);

    expect(signed.context?.signer?.signatures).toEqual([signature]);
    expect(signed.context?.signer?.user).toEqual(signer.user);
    expect(signed.context?.signer?.app).toEqual(signer.app);
    expect(signed.context?.prevOpHash).toBe(stamped.context?.prevOpHash);
  });

  it("preserves signatures the action already carries", async () => {
    const existing: Signature = ["ts0", "did0", "hash0", "prev0", "0xold"];
    const stamped: Action = {
      ...stampAction(action, createDocument({ global: 7 })),
      context: {
        signer: {
          user: { address: "0x2", networkId: "eip155", chainId: 1 },
          app: { name: "other", key: "other-key" },
          signatures: [existing],
        },
      },
    };

    const signed = await signStampedAction(stamped, createSigner());

    expect(signed.context?.signer?.signatures).toEqual([existing, signature]);
    expect(signed.context?.signer?.app.name).toBe("other");
  });

  it("signs the stamped action, not a copy without the stamp", async () => {
    const signer = createSigner();
    const stamped = stampAction(action, createDocument({ global: 7 }));
    await signStampedAction(stamped, signer);

    const argument = vi.mocked(signer.signAction).mock.calls[0][0];
    expect(argument.context?.prevOpHash).toBe(stamped.context?.prevOpHash);
  });

  it("rejects when neither the action nor the signer has an identity", async () => {
    const signer = { signAction: vi.fn() } as unknown as ISigner;
    const stamped = stampAction(action, createDocument({ global: 7 }));

    await expect(signStampedAction(stamped, signer)).rejects.toThrow(
      "no user or app identity",
    );
    expect(signer.signAction).not.toHaveBeenCalled();
  });
});
