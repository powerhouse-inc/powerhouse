import { describe, expect, it } from "vitest";
import {
  actionPreimageV2,
  actionSigningTarget,
  CanonicalJsonError,
  canonicalJson,
  hashActionV2,
  signActionV2,
  v2TupleProblem,
  type ActionSignerIdentity,
} from "./action-signature.js";
import type { Action } from "./actions.js";
import { buildOperationSignatureMessage } from "./crypto.js";
import { deserializeSignature, serializeSignature } from "./signatures.js";

const target = { documentId: "doc-1", branch: "main" };
const identity: ActionSignerIdentity = {
  user: { address: "0xabc", networkId: "eip155", chainId: 1 },
  app: { name: "test", key: "did:key:zTest" },
};

function action(overrides: Partial<Action> = {}): Action {
  return {
    id: "action-1",
    type: "SET_NAME",
    scope: "global",
    timestampUtcMs: "2026-01-01T00:00:00.000Z",
    input: { name: "x" },
    ...overrides,
  };
}

function sparse(): unknown[] {
  const array: unknown[] = [1];
  array[2] = 3;
  return array;
}

describe("canonicalJson", () => {
  it("sorts keys at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    );
  });

  it("omits undefined properties, as JSON does", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it.each([
    ["undefined", undefined],
    ["BigInt", BigInt(1)],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["a sparse array", sparse()],
    ["undefined in an array", [1, undefined]],
    ["a lone surrogate", "\ud800"],
    ["a lone surrogate key", { "\udc00": 1 }],
    ["a function", () => 1],
    ["nested BigInt", { a: [{ b: BigInt(2) }] }],
  ])("refuses %s", (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(CanonicalJsonError);
  });

  it("refuses a circular value", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => canonicalJson(value)).toThrow(CanonicalJsonError);
  });

  it("accepts a repeated, non-circular reference", () => {
    const shared = { a: 1 };
    expect(canonicalJson({ x: shared, y: shared })).toBe(
      '{"x":{"a":1},"y":{"a":1}}',
    );
  });

  it("keeps a well-formed surrogate pair", () => {
    expect(canonicalJson("😀")).toBe('"😀"');
  });
});

describe("hashActionV2", () => {
  it("is v2: and 43 unpadded base64url characters", async () => {
    const hash = await hashActionV2(action(), target, identity);
    expect(hash).toMatch(/^v2:[A-Za-z0-9_-]{43}$/);
  });

  it("covers the preimage in its specified order", () => {
    expect(actionPreimageV2(action(), target, identity)).toBe(
      JSON.stringify([
        "v2",
        "doc-1",
        "main",
        "global",
        "SET_NAME",
        "action-1",
        "2026-01-01T00:00:00.000Z",
        { name: "x" },
        "0xabc",
        "eip155",
        1,
        "did:key:zTest",
      ]),
    );
  });

  it("is independent of input key order", async () => {
    const a = await hashActionV2(
      action({ input: { a: 1, b: 2 } }),
      target,
      identity,
    );
    const b = await hashActionV2(
      action({ input: { b: 2, a: 1 } }),
      target,
      identity,
    );
    expect(a).toBe(b);
  });

  it("does not normalize unicode", async () => {
    const nfc = "caf\u00e9";
    const nfd = "cafe\u0301";
    expect(nfc.normalize("NFC")).toBe(nfd.normalize("NFC"));
    expect(
      await hashActionV2(action({ input: { name: nfc } }), target, identity),
    ).not.toBe(
      await hashActionV2(action({ input: { name: nfd } }), target, identity),
    );
  });

  const variants: [string, () => Promise<string>][] = [
    [
      "documentId",
      () =>
        hashActionV2(action(), { ...target, documentId: "doc-2" }, identity),
    ],
    [
      "branch",
      () => hashActionV2(action(), { ...target, branch: "draft" }, identity),
    ],
    ["scope", () => hashActionV2(action({ scope: "local" }), target, identity)],
    ["type", () => hashActionV2(action({ type: "SET_X" }), target, identity)],
    ["id", () => hashActionV2(action({ id: "action-2" }), target, identity)],
    [
      "timestamp",
      () =>
        hashActionV2(
          action({ timestampUtcMs: "2026-01-01T00:00:00.001Z" }),
          target,
          identity,
        ),
    ],
    [
      "input",
      () => hashActionV2(action({ input: { name: "y" } }), target, identity),
    ],
    [
      "user.address",
      () =>
        hashActionV2(action(), target, {
          ...identity,
          user: { ...identity.user, address: "0xdef" },
        }),
    ],
    [
      "user.networkId",
      () =>
        hashActionV2(action(), target, {
          ...identity,
          user: { ...identity.user, networkId: "solana" },
        }),
    ],
    [
      "user.chainId",
      () =>
        hashActionV2(action(), target, {
          ...identity,
          user: { ...identity.user, chainId: 2 },
        }),
    ],
    [
      "app.key",
      () =>
        hashActionV2(action(), target, {
          ...identity,
          app: { ...identity.app, key: "did:key:zOther" },
        }),
    ],
  ];

  it.each(variants)("changes with %s", async (_field, variant) => {
    const base = await hashActionV2(action(), target, identity);
    expect(await variant()).not.toBe(base);
  });

  it("ignores the app name, which is not signed", async () => {
    expect(
      await hashActionV2(action(), target, {
        ...identity,
        app: { ...identity.app, name: "renamed" },
      }),
    ).toBe(await hashActionV2(action(), target, identity));
  });

  it("refuses an empty document id or branch", async () => {
    await expect(
      hashActionV2(action(), { ...target, documentId: "" }, identity),
    ).rejects.toThrow(CanonicalJsonError);
    await expect(
      hashActionV2(action(), { ...target, branch: "" }, identity),
    ).rejects.toThrow(CanonicalJsonError);
  });

  it("refuses an action with no input or a BigInt in it", async () => {
    await expect(
      hashActionV2(action({ input: undefined }), target, identity),
    ).rejects.toThrow(/has no input/);
    await expect(
      hashActionV2(action({ input: { n: BigInt(1) } }), target, identity),
    ).rejects.toThrow(/input\.n/);
  });

  it("accepts any JSON value as input", async () => {
    for (const input of [null, 0, "text", [1, 2], true]) {
      await expect(
        hashActionV2(action({ input }), target, identity),
      ).resolves.toMatch(/^v2:/);
    }
  });
});

describe("signActionV2", () => {
  async function keyPair() {
    return crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
  }

  it("emits a well-formed tuple whose ECDSA covers tuple[0..3]", async () => {
    const keys = await keyPair();
    const tuple = await signActionV2({
      action: action(),
      target,
      signer: identity,
      previousStateHash: "prev",
      sign: async (message) =>
        new Uint8Array(
          await crypto.subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            keys.privateKey,
            message.buffer as ArrayBuffer,
          ),
        ),
    });

    expect(v2TupleProblem(tuple)).toBeUndefined();
    expect(tuple[1]).toBe(identity.app.key);
    expect(tuple[2]).toBe(await hashActionV2(action(), target, identity));
    expect(tuple[3]).toBe("prev");

    const signature = Uint8Array.from(
      tuple[4]
        .slice(2)
        .match(/.{2}/g)!
        .map((byte) => parseInt(byte, 16)),
    );
    const message = buildOperationSignatureMessage([
      tuple[0],
      tuple[1],
      tuple[2],
      tuple[3],
    ]);
    expect(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        keys.publicKey,
        signature.buffer as ArrayBuffer,
        message.buffer as ArrayBuffer,
      ),
    ).toBe(true);

    expect(deserializeSignature(serializeSignature(tuple))).toEqual(tuple);
  });

  it("refuses a signing handler that is not raw P-256", async () => {
    await expect(
      signActionV2({
        action: action(),
        target,
        signer: identity,
        sign: () => Promise.resolve(new Uint8Array(70)),
      }),
    ).rejects.toThrow(/64-byte/);
  });
});

describe("v2TupleProblem", () => {
  const good = [
    "1790000000",
    "did:key:zTest",
    `v2:${"A".repeat(43)}`,
    "",
    `0x${"a".repeat(128)}`,
  ] as [string, string, string, string, string];

  it.each([
    ["a 42-character hash", { 2: `v2:${"A".repeat(42)}` }],
    ["a 44-character hash", { 2: `v2:${"A".repeat(44)}` }],
    ["a padded hash", { 2: `v2:${"A".repeat(42)}=` }],
    ["a standard-alphabet hash", { 2: `v2:${"A".repeat(41)}+A` }],
    ["a non-canonical last character", { 2: `v2:${"A".repeat(42)}B` }],
    ["uppercase hex", { 4: `0x${"A".repeat(128)}` }],
    ["unprefixed hex", { 4: "a".repeat(130) }],
    ["short hex", { 4: `0x${"a".repeat(126)}` }],
    ["a fractional signing time", { 0: "1790000000.5" }],
  ])("rejects %s", (_label, patch) => {
    const tuple = [...good] as typeof good;
    for (const [index, value] of Object.entries(patch)) {
      tuple[Number(index)] = value;
    }
    expect(v2TupleProblem(tuple)).toBeDefined();
  });

  it("accepts the canonical shape", () => {
    expect(v2TupleProblem(good)).toBeUndefined();
  });
});

describe("actionSigningTarget", () => {
  it("routes a relationship action to its source document", () => {
    expect(
      actionSigningTarget(
        { type: "ADD_RELATIONSHIP", input: { sourceId: "drive" } },
        "file",
        "main",
      ),
    ).toEqual({ documentId: "drive", branch: "main" });
  });

  it("keeps a model action on the job's document", () => {
    expect(
      actionSigningTarget(
        { type: "SET_NAME", input: { documentId: "elsewhere" } },
        "doc",
        "main",
      ),
    ).toEqual({ documentId: "doc", branch: "main" });
  });
});
