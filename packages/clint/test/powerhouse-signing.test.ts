/**
 * The client-agnostic signing rules (`signing.ts`) and the writes readiness
 * built from them (`writes.ts`). Ported from ph-clint's powerhouse-signing
 * suite without the embedded reactor's write-guarded client, which is not
 * ported; the remote client's side is in remote-reactor.test.ts.
 */
import { describe, expect, it } from "vitest";
import type {
  ActionSigningTarget,
  ISigner,
  UserActionSigner,
} from "@powerhousedao/shared/document-model";
import { setName } from "@powerhousedao/shared/document-model";
import { LocalSigner } from "./fixtures/local-signer.js";
import {
  SignerNotReadyError,
  canWrite,
  createGatedSigner,
  policyOfHeader,
  signerReady,
} from "../src/integrations/powerhouse/signing.js";
import { createReactorWrites } from "../src/integrations/powerhouse/writes.js";

const OWNER: UserActionSigner = {
  address: "0x00000000000000000000000000000000000000a1",
  networkId: "eip155",
  chainId: 1,
};

const TARGET: ActionSigningTarget = { documentId: "doc-1", branch: "main" };

/**
 * A real P-256 signer whose `user` is mutable, like Renown's live signer
 * (set on sign-in). The key and the signing come from LocalSigner.
 */
async function createLiveSigner(): Promise<
  ISigner & { user: UserActionSigner | undefined }
> {
  const local = await LocalSigner.create({ user: OWNER });
  return {
    user: undefined,
    app: local.app,
    publicKey: local.publicKey,
    sign: (data) => local.sign(data),
    verify: () => local.verify(),
    signAction: (action, target) => local.signAction(action, target),
  };
}

const v2 = { header: { id: "a", protocolVersions: { signature: 2 } } };
const legacy = { header: { id: "b", protocolVersions: { "base-reducer": 2 } } };

describe("signerReady", () => {
  it("needs a user with an address", () => {
    const signAction = async () => undefined;
    expect(signerReady({ signAction })).toBe(false);
    expect(signerReady({ user: { address: "" }, signAction })).toBe(false);
    expect(signerReady({ user: OWNER, signAction })).toBe(true);
  });
});

describe("policyOfHeader", () => {
  it("reads v2-required from a signature protocol of 2 or more", () => {
    expect(policyOfHeader(v2.header)).toBe("v2-required");
    expect(
      policyOfHeader({ id: "c", protocolVersions: { signature: 3 } }),
    ).toBe("v2-required");
  });

  it("treats everything else as legacy", () => {
    expect(policyOfHeader(legacy.header)).toBe("legacy");
    expect(policyOfHeader({ id: "d", protocolVersions: null })).toBe("legacy");
    expect(policyOfHeader({ id: "e" })).toBe("legacy");
    expect(policyOfHeader(undefined)).toBe("legacy");
  });
});

describe("createGatedSigner", () => {
  it("refuses to sign while the live signer has no user, and signs once it has one", async () => {
    const signer = await createLiveSigner();
    const gated = createGatedSigner(signer);
    const action = setName("x");

    await expect(gated.signAction(action, TARGET)).rejects.toBeInstanceOf(
      SignerNotReadyError,
    );

    signer.user = OWNER;
    const signature = await gated.signAction(action, TARGET);
    expect(Array.isArray(signature)).toBe(true);
  });

  it("reads everything else through to the live signer", async () => {
    const signer = await createLiveSigner();
    const gated = createGatedSigner(signer);
    expect(gated.app).toBe(signer.app);
    expect(gated.user).toBeUndefined();
    signer.user = OWNER;
    expect(gated.user).toBe(OWNER);
    // Methods stay bound to the live signer.
    const bytes = await gated.sign(new Uint8Array([1, 2, 3]));
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("works over a class instance (LocalSigner getters and methods)", async () => {
    const local = await LocalSigner.create();
    const gated = createGatedSigner(local);
    expect(gated.did).toBe(local.did);
    await expect(gated.signAction(setName("y"), TARGET)).resolves.toBeDefined();
  });
});

describe("canWrite", () => {
  it("needs a ready signer for v2 documents", () => {
    expect(
      canWrite({ ready: () => false, legacyDocuments: "refuse" }, v2),
    ).toBe(false);
    expect(canWrite({ ready: () => true, legacyDocuments: "refuse" }, v2)).toBe(
      true,
    );
  });

  it("follows the legacy rule for legacy documents", () => {
    expect(
      canWrite({ ready: () => true, legacyDocuments: "refuse" }, legacy),
    ).toBe(false);
    expect(
      canWrite(
        { ready: () => false, legacyDocuments: "sign-when-ready" },
        legacy,
      ),
    ).toBe(true);
  });

  it("applies the host rule first", () => {
    expect(
      canWrite(
        { ready: () => true, legacyDocuments: "refuse", accepts: () => false },
        v2,
      ),
    ).toBe(false);
  });
});

describe("createReactorWrites", () => {
  it("is always ready without a signer, and hands the client none", () => {
    const { writes, signer } = createReactorWrites();
    expect(writes.ready()).toBe(true);
    expect(writes.canWrite(v2)).toBe(true);
    expect(writes.canWrite(legacy)).toBe(true);
    expect(signer).toBeUndefined();
  });

  it("follows the live signer and the host's rules", async () => {
    const live = await createLiveSigner();
    const { writes } = createReactorWrites({
      signer: live,
      accepts: (document) => document.header.id !== "skip",
    });
    expect(writes.ready()).toBe(false);
    expect(writes.canWrite(v2)).toBe(false);
    // Legacy documents default to sign-when-ready.
    expect(writes.canWrite(legacy)).toBe(true);

    live.user = OWNER;
    expect(writes.ready()).toBe(true);
    expect(writes.canWrite(v2)).toBe(true);
    expect(writes.canWrite({ header: { ...v2.header, id: "skip" } })).toBe(
      false,
    );

    const refusing = createReactorWrites({
      signer: live,
      legacyDocuments: "refuse",
    });
    expect(refusing.writes.canWrite(legacy)).toBe(false);
  });

  it("hands the client a signer that refuses while there is no user", async () => {
    const live = await createLiveSigner();
    const { signer } = createReactorWrites({ signer: live });
    expect(signer).toBeDefined();
    expect(() => signer!()).toThrow(SignerNotReadyError);

    live.user = OWNER;
    // An eager signer is handed back as it is, not as a promise.
    const gated = signer!() as ISigner;
    expect(gated.app?.key).toBe(live.app?.key);
    await expect(gated.signAction(setName("z"), TARGET)).resolves.toBeDefined();
    // The gate is live: a sign-out closes it again.
    live.user = undefined;
    await expect(gated.signAction(setName("z"), TARGET)).rejects.toBeInstanceOf(
      SignerNotReadyError,
    );
  });

  it("opens a lazy signer at the first write, and only while it is ready", async () => {
    const local = await LocalSigner.create({ user: OWNER });
    let ready = false;
    let opened = 0;
    const { writes, signer } = createReactorWrites({
      signer: {
        ready: () => ready,
        open: () => {
          opened++;
          return Promise.resolve(local as unknown as ISigner);
        },
      },
    });
    expect(writes.ready()).toBe(false);
    expect(writes.canWrite(v2)).toBe(false);
    expect(() => signer!()).toThrow(SignerNotReadyError);
    expect(opened).toBe(0);

    ready = true;
    expect(writes.ready()).toBe(true);
    const opening = signer!();
    expect(opened).toBe(1);
    await expect(opening).resolves.toBe(local);
  });

  it("announces powerhouse:writes:ready when writes become possible, and stops watching", async () => {
    const live = await createLiveSigner();
    const events: string[] = [];
    let notify: (() => void) | undefined;
    const { stop } = createReactorWrites({
      signer: live,
      emit: (event) => {
        events.push(event);
      },
      onSignerChange: (listener) => {
        notify = listener;
        return () => {
          notify = undefined;
        };
      },
    });

    notify?.();
    expect(events).toEqual([]);

    live.user = OWNER;
    notify?.();
    expect(events).toEqual(["powerhouse:writes:ready"]);
    // Still ready: no second announcement.
    notify?.();
    expect(events).toEqual(["powerhouse:writes:ready"]);

    live.user = undefined;
    notify?.();
    live.user = OWNER;
    notify?.();
    expect(events).toEqual([
      "powerhouse:writes:ready",
      "powerhouse:writes:ready",
    ]);

    stop();
    expect(notify).toBeUndefined();
  });
});
