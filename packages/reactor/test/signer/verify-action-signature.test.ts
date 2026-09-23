import type { Action, Signature } from "@powerhousedao/shared/document-model";
import { beforeAll, describe, expect, it } from "vitest";
import { cachedDidKeyCount, importDidKey } from "../../src/signer/did-key.js";
import { verifyActionSignature } from "../../src/signer/verify-action-signature.js";
import { createTestAction } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const DOC = "doc-1";
const target = { documentId: DOC, branch: "main" };

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

  describe("v2", () => {
    async function v2Signed(a: Action = action()): Promise<Action> {
      return signer.signed(a, await signer.v2Tuple(a, target));
    }

    it("accepts a v2 tuple at mutation and load admission", async () => {
      const signed = await v2Signed();
      for (const path of ["mutation", "load"] as const) {
        expect(await verifyActionSignature(signed, target, path)).toEqual({
          ok: true,
          scheme: "v2",
        });
      }
    });

    it("accepts reordered input keys, as a jsonb round trip leaves them", async () => {
      const signed = await v2Signed(action({ a: 1, b: { d: 1, c: 2 } }));
      const reordered = { ...signed, input: { b: { c: 2, d: 1 }, a: 1 } };
      expect(await verifyActionSignature(reordered, target, "load")).toEqual({
        ok: true,
        scheme: "v2",
      });
    });

    it.each([
      ["another document", { documentId: "doc-2", branch: "main" }],
      ["another branch", { documentId: DOC, branch: "draft" }],
    ])("refuses the tuple replayed onto %s", async (_label, elsewhere) => {
      const signed = await v2Signed();
      for (const path of ["mutation", "load"] as const) {
        expect(
          await verifyActionSignature(signed, elsewhere, path),
        ).toMatchObject({ ok: false, code: "HASH_MISMATCH" });
      }
    });

    it.each([
      ["another scope", (a: Action) => ({ ...a, scope: "local" })],
      ["mutated input", (a: Action) => ({ ...a, input: { a: 1, b: 3 } })],
      ["a fresh action id", (a: Action) => ({ ...a, id: "other-id" })],
      [
        "a later timestamp",
        (a: Action) => ({ ...a, timestampUtcMs: "2099-01-01T00:00:00.000Z" }),
      ],
      [
        "a relabelled signer.user",
        (a: Action) => ({
          ...a,
          context: {
            signer: {
              ...a.context!.signer!,
              user: { address: "0xevil", networkId: "eip155", chainId: 1 },
            },
          },
        }),
      ],
    ])("refuses the tuple on %s", async (_label, change) => {
      const replayed = change(await v2Signed());
      for (const path of ["mutation", "load"] as const) {
        expect(
          await verifyActionSignature(replayed, target, path),
        ).toMatchObject({ ok: false, scheme: "v2", code: "HASH_MISMATCH" });
      }
    });

    it("refuses an operation stamped at another instant than its action", async () => {
      const signed = await v2Signed();
      const verdict = await verifyActionSignature(signed, target, "load", {
        timestampUtcMs: "2099-01-01T00:00:00.000Z",
      });
      expect(verdict).toMatchObject({ ok: false, code: "TIMESTAMP_MISMATCH" });
    });

    it("accepts an operation timestamp a store reformatted", async () => {
      const a = action();
      const signed = await v2Signed({
        ...a,
        timestampUtcMs: "2026-01-01T00:00:00Z",
      });
      const verdict = await verifyActionSignature(signed, target, "load", {
        timestampUtcMs: "2026-01-01T00:00:00.000Z",
      });
      expect(verdict).toEqual({ ok: true, scheme: "v2" });
    });

    it("refuses a v2 tuple whose ECDSA another key made", async () => {
      const a = action();
      const tuple = await other.v2Tuple(a, target, signer.user);
      const forged = signer.signed(a, [
        tuple[0],
        signer.did,
        tuple[2],
        tuple[3],
        tuple[4],
      ]);
      const verdict = await verifyActionSignature(forged, target, "load");
      expect(verdict).toMatchObject({ ok: false, code: "HASH_MISMATCH" });

      const sameIdentity = signer.signed(a, [
        tuple[0],
        signer.did,
        await signer.v2Tuple(a, target).then((t) => t[2]),
        tuple[3],
        tuple[4],
      ]);
      expect(
        await verifyActionSignature(sameIdentity, target, "load"),
      ).toMatchObject({ ok: false, code: "BAD_SIGNATURE" });
    });

    it.each([
      ["42 characters", `v2:${"A".repeat(42)}`],
      ["44 characters", `v2:${"A".repeat(44)}`],
      ["padding", `v2:${"A".repeat(42)}=`],
      ["the standard alphabet", `v2:${"A".repeat(41)}/A`],
      ["no body", "v2:"],
    ])("refuses a v2 hash with %s", async (_label, hash) => {
      const a = action();
      const signed = signer.signed(a, await signer.tupleOver(hash));
      for (const path of ["mutation", "load"] as const) {
        expect(await verifyActionSignature(signed, target, path)).toMatchObject(
          { ok: false, scheme: "v2", code: "MALFORMED_TUPLE" },
        );
      }
    });

    it("refuses a v2 tuple against an empty branch", async () => {
      const signed = await v2Signed();
      const verdict = await verifyActionSignature(
        signed,
        { documentId: DOC, branch: "" },
        "mutation",
      );
      expect(verdict).toMatchObject({ ok: false, code: "HASH_MISMATCH" });
    });
  });
});
