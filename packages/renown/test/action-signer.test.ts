import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import { Renown, RenownMemoryStorage } from "../src/common.js";
import { MemoryKeyStorage, RenownCryptoBuilder } from "../src/crypto/index.js";
import { MemoryEventEmitter } from "../src/event/memory.js";
import type { IRenownCrypto } from "../src/crypto/index.js";
import type { RenownEventEmitter, User } from "../src/types.js";

/**
 * What the signer may carry about the user.
 *
 * `User` is the session record: it holds the DID, the credential, the fetched
 * profile and ENS info alongside the address. `UserActionSigner` — what a signed
 * action carries — is deliberately just an address on a chain, and the reactor's
 * `ReactorSignerUserInput` declares exactly those three fields.
 *
 * Handing the session record to the signer used to make every signed push fail
 * before it reached the reactor: a GraphQL input object refuses a field it does
 * not declare by rejecting the whole request, so the write was answered with a
 * 400 and nothing was stored. The compiler cannot catch the difference —
 * excess-property checks apply to fresh object literals, never to a variable of
 * a wider type — so it is pinned here instead.
 */

const TEST_ACCOUNT = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const TEST_ADDRESS = TEST_ACCOUNT.address;

/** The three fields the wire declares, and the only ones it accepts. */
const ACTION_SIGNER_FIELDS = ["address", "chainId", "networkId"] as const;

/** A session record, exactly as `#updateUser` stores one. */
function sessionUser(): User {
  return {
    address: TEST_ADDRESS,
    networkId: "eip155",
    chainId: 1,
    ens: { name: "test.eth" },
    did: `did:pkh:eip155:1:${TEST_ADDRESS}`,
    credential: undefined,
    profile: {
      documentId: "renown-user-1",
      username: "tester",
      ethAddress: TEST_ADDRESS,
      userImage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  } as unknown as User;
}

describe("the signer's user is narrowed to the action-signer fields", () => {
  let crypto: IRenownCrypto;
  let emitter: RenownEventEmitter;
  let store: RenownMemoryStorage;

  beforeEach(async () => {
    crypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    emitter = new MemoryEventEmitter();
    store = new RenownMemoryStorage();
  });

  const makeRenown = () =>
    new Renown(store, emitter, crypto, "test-app", "https://test.renown.id");

  it("narrows a user restored from storage at construction", () => {
    store.set("user", sessionUser());

    const renown = makeRenown();

    expect(renown.signer.user).toEqual({
      address: TEST_ADDRESS,
      networkId: "eip155",
      chainId: 1,
    });
    expect(Object.keys(renown.signer.user!).sort()).toEqual([
      ...ACTION_SIGNER_FIELDS,
    ]);
  });

  it("narrows a user arriving after construction", () => {
    const renown = makeRenown();
    expect(renown.signer.user).toBeUndefined();

    emitter.emit("user", sessionUser());

    expect(Object.keys(renown.signer.user!).sort()).toEqual([
      ...ACTION_SIGNER_FIELDS,
    ]);
  });

  it("carries none of the session-only fields", () => {
    store.set("user", sessionUser());

    const signerUser = makeRenown().signer.user as Record<string, unknown>;

    /* Named one by one rather than as a count: each is a field the reactor
       rejects the request over, and the error names only the first. */
    for (const field of ["did", "credential", "profile", "ens"]) {
      expect(signerUser).not.toHaveProperty(field);
    }
  });

  it("clears the signer's user on sign-out", () => {
    store.set("user", sessionUser());
    const renown = makeRenown();

    emitter.emit("user", undefined);

    expect(renown.signer.user).toBeUndefined();
  });

  it("keeps the restored session authorized", () => {
    /* The narrowing must not disturb the restored-session check that reads the
       same variable two lines below it. */
    store.set("user", sessionUser());

    expect(makeRenown().status).toBe("authorized");
  });
});
