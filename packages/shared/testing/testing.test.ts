import { describe, expect, it } from "vitest";
import { didOfP256Jwk, type JsonWebKey } from "../clis/sessions.js";
import {
  hashActionV2,
  v2TupleProblem,
} from "../document-model/action-signature.js";
import type { Action } from "../document-model/actions.js";
import {
  buildOperationSignatureMessage,
  hex2ab,
} from "../document-model/crypto.js";
import { signFor, TEST_SIGNER_ADDRESS, testSigner } from "./index.js";

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

describe("testSigner", () => {
  it("signs for the test address, as session 'test', unless told otherwise", async () => {
    const plain = await testSigner();
    expect(plain.user?.address).toBe(TEST_SIGNER_ADDRESS);
    expect(plain.app?.name).toBe("test");

    const named = await testSigner("0xdef", { app: "agent" });
    expect(named.user).toEqual({
      address: "0xdef",
      networkId: "eip155",
      chainId: 1,
    });
    expect(named.app?.name).toBe("agent");
  });

  it("names its key by the did:key a session file gives the same key", async () => {
    const signer = await testSigner();
    const jwk = (await globalThis.crypto.subtle.exportKey(
      "jwk",
      signer.publicKey,
    )) as JsonWebKey;
    expect(signer.app?.key).toBe(didOfP256Jwk(jwk));
  });

  it("signs a v2 tuple over the action, its log and its signer, that its key verifies", async () => {
    const signer = await testSigner();
    const target = { documentId: "doc-1", branch: "main" };
    const signed = action({ context: { prevOpHash: "prev" } });
    const tuple = await signer.signAction(signed, target);

    expect(v2TupleProblem(tuple)).toBeUndefined();
    expect(tuple[1]).toBe(signer.app?.key);
    expect(tuple[2]).toBe(
      await hashActionV2(signed, target, {
        user: signer.user!,
        app: signer.app!,
      }),
    );
    expect(tuple[3]).toBe("prev");
    const message = buildOperationSignatureMessage([
      tuple[0],
      tuple[1],
      tuple[2],
      tuple[3],
    ]);
    await expect(
      signer.verify(message, hex2ab(tuple[4].slice(2))),
    ).resolves.toBeUndefined();
    await expect(signer.verify(message, new Uint8Array(64))).rejects.toThrow();
  });

  it("gives each signer its own key", async () => {
    const [a, b] = await Promise.all([testSigner(), testSigner()]);
    expect(a.app?.key).not.toBe(b.app?.key);
  });
});

describe("signFor", () => {
  it("returns the action with its signer and the one signature", async () => {
    const signer = await testSigner("0xauthor");
    const signed = await signFor(signer, action(), "doc-1");

    expect(signed.id).toBe("action-1");
    expect(signed.context?.signer?.user.address).toBe("0xauthor");
    expect(signed.context?.signer?.app.key).toBe(signer.app?.key);
    expect(signed.context?.signer?.signatures).toHaveLength(1);
    expect(signed.context?.signer?.signatures[0][1]).toBe(signer.app?.key);
  });
});
