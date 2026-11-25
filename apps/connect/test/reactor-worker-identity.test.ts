import type { User } from "@renown/sdk";
import { describe, expect, it, vi } from "vitest";
import { toReactorIdentity } from "../src/reactor-worker-client.js";
import { createWorkerIdentity } from "../src/reactor-worker-identity.js";

const credential = {
  id: "urn:uuid:c1",
  credentialSubject: { id: "did:key:z" },
};
const person = {
  address: "0xabc",
  chainId: 1,
  networkId: "eip155",
  credential,
};

describe("the worker's identity", () => {
  it("signs with the signer fields only, and bears the credential", () => {
    const identity = createWorkerIdentity({ askTabs: vi.fn() });
    identity.set(person);
    expect(identity.signerUser).toEqual({
      address: "0xabc",
      chainId: 1,
      networkId: "eip155",
    });
    expect(identity.credential).toBe(credential);
  });

  it("asks the tabs once while nobody is signed in, until one answers", async () => {
    const askTabs = vi.fn();
    const identity = createWorkerIdentity({ askTabs });
    const waiting = Promise.all([identity.ensure(), identity.ensure()]);
    expect(askTabs).toHaveBeenCalledOnce();
    identity.set(person);
    await waiting;
    await identity.ensure();
    expect(askTabs).toHaveBeenCalledOnce();
  });

  it("stops asking tabs that declined, until someone signs in and out", async () => {
    const askTabs = vi.fn();
    const identity = createWorkerIdentity({ askTabs });
    const first = identity.ensure();
    identity.set(null);
    await first;
    await identity.ensure();
    expect(askTabs).toHaveBeenCalledOnce();

    identity.set(person);
    identity.set(null);
    const again = identity.ensure();
    expect(askTabs).toHaveBeenCalledTimes(2);
    identity.set(null);
    await again;
  });

  it("signs anonymously when no tab answers in time", async () => {
    const identity = createWorkerIdentity({ askTabs: vi.fn(), waitMs: 10 });
    await identity.ensure();
    expect(identity.current).toBeNull();
  });

  it("is what a tab posts: the signer fields and the credential", () => {
    expect(toReactorIdentity(person as unknown as User)).toEqual(person);
    expect(toReactorIdentity(undefined)).toBeNull();
  });
});
