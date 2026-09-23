import type { Action, Signature } from "@powerhousedao/shared/document-model";
import { beforeAll, describe, expect, it } from "vitest";
import { cachedDidKeyCount, importDidKey } from "../../src/signer/did-key.js";
import { verifyActionSignature } from "../../src/signer/verify-action-signature.js";
import { createTestAction } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const DOC = "doc-1";
const target = { documentId: DOC };

// Produced by RenownCryptoSigner.signAction, to pin the format to renown.
const RENOWN_VECTOR = {
  did: "did:key:zDnaeQbz8fTFboX2E8dkHt1gVdUv7ubKECvBHi8pMjuuVYgVs",
  action: {
    id: "vector-action-1",
    type: "SET_NAME",
    scope: "global",
    timestampUtcMs: "2026-01-01T00:00:00.000Z",
    input: { name: "vector", nested: { b: 2, a: 1 } },
  } as unknown as Action,
  tuple: [
    "1790199894",
    "did:key:zDnaeQbz8fTFboX2E8dkHt1gVdUv7ubKECvBHi8pMjuuVYgVs",
    "AR4VszXRrrW+cH6xIjwJSDb0cTidg9xJpFgppne9dkw=",
    "",
    "0x7d92c5c30c84316da7d3b91358d4efd42b2aefdc7d463e44a6f8904c67145a44076daacbab3edfe2d6a364cea0e9038a4650964f93fe1c038804e6d233940b5b",
  ] as Signature,
};

describe("verifyActionSignature", () => {
  let signer: TestP256Signer;
  let other: TestP256Signer;

  beforeAll(async () => {
    signer = await TestP256Signer.create();
    other = await TestP256Signer.create();
  });

  function action(input: unknown = { b: 2, a: 1 }): Action {
    return createTestAction({ type: "SET_NAME", input } as Partial<Action>);
  }

  it("treats an action without a signer as unsigned", async () => {
    expect(await verifyActionSignature(action(), target, "mutation")).toEqual({
      ok: true,
      scheme: "unsigned",
    });
  });

  it("treats the PassthroughSigner's empty key as unsigned", async () => {
    const passthrough: Action = {
      ...action(),
      context: {
        signer: {
          user: { address: "", networkId: "", chainId: 0 },
          app: { name: "", key: "" },
          signatures: [["", "", "", "", ""]],
        },
      },
    };
    const verdict = await verifyActionSignature(
      passthrough,
      target,
      "mutation",
    );
    expect(verdict).toEqual({ ok: true, scheme: "unsigned" });
  });

  it("refuses a signer that carries no tuple", async () => {
    const bare = { ...action(), context: { signer: signer.actionSigner([]) } };
    const verdict = await verifyActionSignature(bare, target, "load");
    expect(verdict).toMatchObject({ ok: false, code: "MALFORMED_TUPLE" });
  });

  it("accepts a renown tuple at mutation admission", async () => {
    const a = action();
    const signed = signer.signed(a, await signer.renownTuple(a));
    expect(await verifyActionSignature(signed, target, "mutation")).toEqual({
      ok: true,
      scheme: "legacy-renown",
    });
  });

  it("accepts a tuple RenownCryptoSigner produced, and refuses it on other input", async () => {
    const signed: Action = {
      ...RENOWN_VECTOR.action,
      context: {
        signer: {
          user: { address: "0xabc", networkId: "eip155", chainId: 1 },
          app: { name: "vector-app", key: RENOWN_VECTOR.did },
          signatures: [RENOWN_VECTOR.tuple],
        },
      },
    };
    expect(await verifyActionSignature(signed, target, "mutation")).toEqual({
      ok: true,
      scheme: "legacy-renown",
    });

    const tampered = { ...signed, input: { name: "other" } };
    expect(
      await verifyActionSignature(tampered, target, "mutation"),
    ).toMatchObject({ ok: false, code: "HASH_MISMATCH" });
  });

  it("accepts a shared tuple at mutation admission", async () => {
    const a = action();
    const signed = signer.signed(a, await signer.sharedTuple(a, DOC));
    expect(await verifyActionSignature(signed, target, "mutation")).toEqual({
      ok: true,
      scheme: "legacy-shared",
    });
  });

  it.each(["renown", "shared"] as const)(
    "refuses a %s tuple over tampered input at mutation admission",
    async (scheme) => {
      const a = action();
      const tuple =
        scheme === "renown"
          ? await signer.renownTuple(a)
          : await signer.sharedTuple(a, DOC);
      const tampered = signer.signed({ ...a, input: { a: 1, b: 3 } }, tuple);

      const verdict = await verifyActionSignature(tampered, target, "mutation");
      expect(verdict).toMatchObject({ ok: false, code: "HASH_MISMATCH" });
    },
  );

  it("refuses a shared tuple signed for another document", async () => {
    const a = action();
    const signed = signer.signed(a, await signer.sharedTuple(a, "doc-2"));
    const verdict = await verifyActionSignature(signed, target, "mutation");
    expect(verdict).toMatchObject({ ok: false, code: "HASH_MISMATCH" });
  });

  it("refuses a legacy hash of any other length at mutation admission", async () => {
    const a = action();
    const signed = signer.signed(a, await signer.tupleOver("x".repeat(30)));
    const verdict = await verifyActionSignature(signed, target, "mutation");
    expect(verdict).toMatchObject({
      ok: false,
      scheme: "legacy-unknown",
      code: "MALFORMED_TUPLE",
    });
  });

  it("checks only ECDSA at load admission, so reordered keys still pass", async () => {
    const a = action({ a: 1, b: 2 });
    const tuple = await signer.renownTuple(a);
    const reordered = signer.signed({ ...a, input: { b: 2, a: 1 } }, tuple);

    expect(await verifyActionSignature(reordered, target, "load")).toEqual({
      ok: true,
      scheme: "legacy-renown",
    });
    expect(
      await verifyActionSignature(reordered, target, "mutation"),
    ).toMatchObject({ ok: false, code: "HASH_MISMATCH" });
  });

  it("accepts a v2 tuple on ECDSA alone", async () => {
    const a = action();
    const signed = signer.signed(
      a,
      await signer.tupleOver(`v2:${"A".repeat(43)}`),
    );
    for (const path of ["mutation", "load"] as const) {
      expect(await verifyActionSignature(signed, target, path)).toEqual({
        ok: true,
        scheme: "v2",
      });
    }
  });

  it("refuses a v2 tuple whose signature does not verify", async () => {
    const a = action();
    const tuple = await other.tupleOver(`v2:${"A".repeat(43)}`);
    const forged: Signature = [
      tuple[0],
      signer.did,
      tuple[2],
      tuple[3],
      tuple[4],
    ];
    const verdict = await verifyActionSignature(
      signer.signed(a, forged),
      target,
      "load",
    );
    expect(verdict).toMatchObject({ ok: false, code: "BAD_SIGNATURE" });
  });

  it("refuses a tuple whose key differs from signer.app.key", async () => {
    const a = action();
    const signed = signer.signed(a, await other.renownTuple(a));
    const verdict = await verifyActionSignature(signed, target, "load");
    expect(verdict).toMatchObject({ ok: false, code: "KEY_MISMATCH" });
  });

  it("checks only the last tuple", async () => {
    const a = action();
    const good = await signer.renownTuple(a);
    const signed: Action = {
      ...a,
      context: {
        signer: signer.actionSigner([["0", "0", "0", "0", "0x00"], good]),
      },
    };
    expect(await verifyActionSignature(signed, target, "mutation")).toEqual({
      ok: true,
      scheme: "legacy-renown",
    });
  });

  it("refuses a key that is not a P-256 did:key", async () => {
    const a = action();
    const tuple = await signer.renownTuple(a);
    const wrongKey: Action = {
      ...a,
      context: {
        signer: {
          ...signer.actionSigner([]),
          app: { name: "test", key: "0xpubkey" },
          signatures: [[tuple[0], "0xpubkey", tuple[2], tuple[3], tuple[4]]],
        },
      },
    };
    const verdict = await verifyActionSignature(wrongKey, target, "load");
    expect(verdict).toMatchObject({ ok: false, code: "MALFORMED_TUPLE" });
  });

  it("caches an imported key", async () => {
    const first = await importDidKey(signer.did);
    const count = cachedDidKeyCount();
    expect(await importDidKey(signer.did)).toBe(first);
    expect(cachedDidKeyCount()).toBe(count);
  });
});
