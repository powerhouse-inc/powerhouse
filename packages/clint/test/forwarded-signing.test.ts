import type { Action, ISigner } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import {
  asOwnSigner,
  bearerForRequest,
  callerSigningOf,
  CommandEndedError,
  forwardedSigner,
  signerForWrite,
  withCallerSigning,
  type CallerAsks,
  type SignerIdentity,
} from "../src/core/forwarded-signing.js";
import { asInstance } from "../src/core/forwarded-output.js";

const identity = (name: string): SignerIdentity => ({
  user: { address: `0x${name}`, networkId: "eip155", chainId: 1 },
  app: { name, key: `did:key:${name}` },
});

const tupleOf = (key: string) => ["1", key, "v2:hash", "", "0xsig"];

/** A caller that answers every ask, counting them. */
function caller(name: string, o: { known?: boolean; bearer?: boolean } = {}) {
  const asked: { kind: string; payload: unknown }[] = [];
  const asks: CallerAsks = {
    ...(o.known === false ? {} : { signer: identity(name) }),
    asks: new Set([
      "signer",
      "sign-action",
      ...(o.bearer === false ? [] : ["bearer"]),
    ]),
    ask: (kind, payload) => {
      asked.push({ kind, payload });
      if (kind === "signer") return Promise.resolve(identity(name));
      if (kind === "bearer")
        return Promise.resolve({ token: `bearer-${name}` });
      return Promise.resolve(tupleOf(`did:key:${name}`));
    },
  };
  return { asks, asked };
}

const own = {
  user: { address: "0xown", networkId: "eip155", chainId: 1 },
  app: { name: "own", key: "did:key:own" },
} as unknown as ISigner;

const action: Action = {
  id: "a1",
  type: "SET_NAME",
  scope: "global",
  timestampUtcMs: "1700000000000",
  input: { name: "x" },
  context: { prevOpHash: "prev" },
};

describe("a forwarded command's writes", () => {
  it("are signed by the caller while it runs, and by the instance outside", async () => {
    const { asks } = caller("alice");
    const signing = callerSigningOf(asks)!;
    expect(signerForWrite(() => own)).toBe(own);
    const inside = await withCallerSigning(signing, async () =>
      signerForWrite(() => own),
    );
    expect(inside?.user?.address).toBe("0xalice");
    expect(inside?.app?.key).toBe("did:key:alice");
  });

  it("refuse work the command left running, never falling back to the instance", async () => {
    const { asks } = caller("alice");
    let later: Promise<unknown> | undefined;
    await withCallerSigning(callerSigningOf(asks)!, () => {
      later = new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
        signerForWrite(() => own),
      );
      return Promise.resolve();
    });
    await expect(later).rejects.toThrow(CommandEndedError);
  });

  it("keep two commands at once apart", async () => {
    const a = callerSigningOf(caller("alice").asks)!;
    const b = callerSigningOf(caller("bob").asks)!;
    const signerOf = (signing: typeof a) =>
      withCallerSigning(signing, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return (await signerForWrite(undefined))?.user?.address;
      });
    expect(await Promise.all([signerOf(a), signerOf(b)])).toEqual([
      "0xalice",
      "0xbob",
    ]);
  });

  it("sign as the instance in an agent's turn and in the instance's listeners", async () => {
    const signing = callerSigningOf(caller("alice").asks)!;
    await withCallerSigning(signing, async () => {
      expect(asOwnSigner(() => signerForWrite(() => own))).toBe(own);
      expect(asInstance(() => signerForWrite(() => own))).toBe(own);
    });
  });

  it("sign as the instance when the caller cannot sign", async () => {
    const asks: CallerAsks = {
      asks: new Set(),
      ask: () => Promise.reject(new Error("never")),
    };
    expect(callerSigningOf(asks)).toBeUndefined();
    const inside = await withCallerSigning(undefined, async () =>
      signerForWrite(() => own),
    );
    expect(inside).toBe(own);
  });
});

describe("the caller's signer", () => {
  it("asks the caller to sign each action, with what the signature covers", async () => {
    const { asks, asked } = caller("alice");
    const signer = forwardedSigner(identity("alice"), asks.ask);
    const tuple = await signer.signAction(action, {
      documentId: "doc-1",
      branch: "main",
    });
    expect(tuple[1]).toBe("did:key:alice");
    expect(asked).toEqual([
      {
        kind: "sign-action",
        payload: {
          action: {
            id: "a1",
            type: "SET_NAME",
            scope: "global",
            input: { name: "x" },
            timestampUtcMs: "1700000000000",
          },
          target: { documentId: "doc-1", branch: "main" },
          previousStateHash: "prev",
        },
      },
    ]);
  });

  it("refuses a signature by another key", async () => {
    const signer = forwardedSigner(identity("alice"), () =>
      Promise.resolve(tupleOf("did:key:mallory")),
    );
    await expect(
      signer.signAction(action, { documentId: "doc-1", branch: "main" }),
    ).rejects.toThrow(/no signature of did:key:alice/);
  });

  it("signs actions only, and holds no key", async () => {
    const signer = forwardedSigner(identity("alice"), () =>
      Promise.resolve(null),
    );
    await expect(signer.sign(new Uint8Array([1]))).rejects.toThrow(
      /actions only/,
    );
    expect(() => signer.publicKey).toThrow(/caller holds it/);
    // A copy of the signer does not touch the key it does not have.
    expect({ ...signer }.app).toEqual(identity("alice").app);
  });

  it("asks whom it signs as once, when the request did not say", async () => {
    const { asks, asked } = caller("alice", { known: false });
    const signing = callerSigningOf(asks)!;
    await signing.signer();
    await signing.signer();
    expect(asked.filter((a) => a.kind === "signer")).toHaveLength(1);
  });

  it("lends the caller's bearer, kept for the command, and the instance's otherwise", async () => {
    const { asks, asked } = caller("alice");
    const signing = callerSigningOf(asks)!;
    const ownToken = vi.fn(() => Promise.resolve("bearer-own"));
    expect(await bearerForRequest(ownToken)).toBe("bearer-own");
    await withCallerSigning(signing, async () => {
      expect(await bearerForRequest(ownToken)).toBe("bearer-alice");
      expect(await bearerForRequest(ownToken)).toBe("bearer-alice");
    });
    expect(asked.filter((a) => a.kind === "bearer")).toHaveLength(1);

    const silent = callerSigningOf(caller("bob", { bearer: false }).asks)!;
    await withCallerSigning(silent, async () => {
      expect(await bearerForRequest(ownToken)).toBe("bearer-own");
    });
  });
});
