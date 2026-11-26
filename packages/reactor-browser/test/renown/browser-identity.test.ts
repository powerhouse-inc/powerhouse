import {
  BrowserKeyStorage,
  BrowserRenownEventEmitter,
  MemoryKeyStorage,
  parseBrowserPseudonym,
  recoverCredentialRecordRequestSigner,
  Renown,
  RenownCryptoBuilder,
  RenownMemoryStorage,
  verifyCredentialSignature,
} from "@renown/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addLocalSignInEventHandler } from "../../src/hooks/local-sign-in.js";
import { getPHStore } from "../../src/hooks/ph-store.js";
import {
  createBrowserIdentity,
  switchboardBaseOf,
  type BrowserIdentity,
} from "../../src/renown/browser-identity.js";

/* Hosted Connect without a login (F3d): at the first signature with nobody
   signed in, this browser's pseudonym (kept in IndexedDB) signs the tab in,
   enrolled at the switchboards it writes to. A page a local server signs in
   by link keeps to its link. */

const DAY_MS = 86_400_000;

async function newRenown() {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return new Renown(
    new RenownMemoryStorage(),
    new BrowserRenownEventEmitter(),
    crypto,
    "connect",
  );
}

/** The switchboards' enrolment routes: records what each was asked. */
function switchboards() {
  const enrolled: { host: string; sessionDid: string; signer?: string }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/credentials/challenge")) {
      return Response.json({
        host: "did:key:zHost",
        nonce: `n-${enrolled.length}`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    const body = JSON.parse(String(init?.body)) as {
      request: Parameters<typeof recoverCredentialRecordRequestSigner>[0];
      signature: string;
    };
    enrolled.push({
      host: url.origin,
      sessionDid: body.request.sessionDid,
      signer: await recoverCredentialRecordRequestSigner(
        body.request,
        body.signature,
        1,
      ),
    });
    return Response.json({ id: "record", expiresAt: "" });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, enrolled };
}

let dbName: string;
let identity: BrowserIdentity | undefined;

beforeEach(() => {
  dbName = `renownKeyDB-test-${crypto.randomUUID()}`;
});

afterEach(async () => {
  identity?.stop();
  identity = undefined;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
});

describe("the browser's pseudonym", () => {
  it("signs the tab in at the first signature, enrolled where it writes", async () => {
    const renown = await newRenown();
    const store = await BrowserKeyStorage.create(dbName);
    const { fetch, enrolled } = switchboards();
    identity = createBrowserIdentity({
      renown,
      store: () => Promise.resolve(store),
      hosts: () => ["http://a.test", "http://b.test/graphql"],
      localSignInAvailable: () => Promise.resolve(false),
      fetch,
    });

    await Promise.all([identity.ensure(), identity.ensure()]);

    const kept = parseBrowserPseudonym(await store.loadPseudonym());
    expect(kept?.format).toBe("ph-pseudonym");
    expect(renown.user).toMatchObject({
      address: kept!.address,
      local: true,
      localIdentity: "browser",
    });
    const credential = renown.user!.credential!;
    expect(credential.credentialSubject).toEqual({
      id: renown.did,
      app: "connect",
    });
    expect(await verifyCredentialSignature(credential)).toBe(true);
    expect(enrolled).toEqual([
      { host: "http://a.test", sessionDid: renown.did, signer: kept!.address },
      { host: "http://b.test", sessionDid: renown.did, signer: kept!.address },
    ]);

    // Signed in: nothing more to do.
    await identity.ensure();
    expect(enrolled).toHaveLength(2);
  });

  it("is the same one for the next tab of this browser", async () => {
    const store = await BrowserKeyStorage.create(dbName);
    const addresses: string[] = [];
    for (let tab = 0; tab < 2; tab++) {
      const renown = await newRenown();
      const { fetch } = switchboards();
      const each = createBrowserIdentity({
        renown,
        store: () => Promise.resolve(store),
        hosts: () => [],
        localSignInAvailable: () => Promise.resolve(false),
        fetch,
      });
      await each.ensure();
      addresses.push(renown.user!.address);
    }
    expect(addresses[0]).toBe(addresses[1]);
  });

  it("keeps a page a local server signs in by link to its link, and points to it once", async () => {
    addLocalSignInEventHandler();
    window.ph = {};
    const renown = await newRenown();
    const store = await BrowserKeyStorage.create(dbName);
    const local = vi.fn(() => Promise.resolve(true));
    identity = createBrowserIdentity({
      renown,
      store: () => Promise.resolve(store),
      hosts: () => ["http://a.test"],
      localSignInAvailable: local,
      fetch: switchboards().fetch,
    });

    await identity.ensure();
    const notice = getPHStore()?.localSignIn;
    expect(notice?.status).toBe("needs-link");
    (notice as { dismiss: () => void }).dismiss();
    expect(getPHStore()?.localSignIn).toBeUndefined();
    await identity.ensure();

    expect(renown.user).toBeUndefined();
    expect(await store.loadPseudonym()).toBeUndefined();
    expect(local).toHaveBeenCalledOnce();
    expect(getPHStore()?.localSignIn).toBeUndefined();
    window.ph = {};
  });

  it("signs in even where a switchboard is away, which its refusal enrols later", async () => {
    const renown = await newRenown();
    const store = await BrowserKeyStorage.create(dbName);
    const up = switchboards();
    let away = true;
    const fetch: typeof globalThis.fetch = (input, init) =>
      away
        ? Promise.reject(new TypeError("Failed to fetch"))
        : up.fetch(input, init);
    identity = createBrowserIdentity({
      renown,
      store: () => Promise.resolve(store),
      hosts: () => ["http://a.test"],
      localSignInAvailable: () => Promise.resolve(false),
      fetch,
    });

    await identity.ensure();
    expect(renown.user?.localIdentity).toBe("browser");

    away = false;
    expect(await identity.enrolAt("http://a.test/graphql")).toBe(true);
    expect(up.enrolled).toMatchObject([{ host: "http://a.test" }]);
  });

  it("renews under seven days left, and enrols the new credential", async () => {
    const renown = await newRenown();
    const store = await BrowserKeyStorage.create(dbName);
    const { fetch, enrolled } = switchboards();
    let now = Date.now();
    identity = createBrowserIdentity({
      renown,
      store: () => Promise.resolve(store),
      hosts: () => ["http://a.test"],
      localSignInAvailable: () => Promise.resolve(false),
      fetch,
      now: () => now,
    });
    await identity.ensure();
    const first = renown.user!.credential!.id;

    await identity.renew();
    expect(renown.user!.credential!.id).toBe(first);

    now += 25 * DAY_MS;
    await identity.renew();
    expect(renown.user!.credential!.id).not.toBe(first);
    expect(enrolled).toHaveLength(2);
  });

  it("enrols nobody but its own browser identity", async () => {
    const renown = await newRenown();
    const store = await BrowserKeyStorage.create(dbName);
    identity = createBrowserIdentity({
      renown,
      store: () => Promise.resolve(store),
      hosts: () => [],
      localSignInAvailable: () => Promise.resolve(false),
      fetch: switchboards().fetch,
    });
    expect(await identity.enrolAt("http://a.test/graphql")).toBe(false);
  });
});

describe("BrowserKeyStorage's pseudonym", () => {
  it("keeps the first one added, beside the session key", async () => {
    const store = await BrowserKeyStorage.create(dbName);
    const first = { format: "ph-pseudonym", n: 1 };
    const second = { format: "ph-pseudonym", n: 2 };
    expect(await store.loadPseudonym()).toBeUndefined();
    expect(await store.addPseudonym(first as never)).toEqual(first);
    expect(await store.addPseudonym(second as never)).toEqual(first);
    // The session key is apart from it.
    expect(await store.loadKeyPair()).toBeUndefined();
    const other = await BrowserKeyStorage.create(dbName);
    expect(await other.loadPseudonym()).toEqual(first);
  });
});

describe("switchboardBaseOf", () => {
  it("drops the GraphQL path", () => {
    expect(switchboardBaseOf("http://sb.test/graphql")).toBe("http://sb.test");
    expect(switchboardBaseOf("http://sb.test/x/graphql/r/drive")).toBe(
      "http://sb.test/x",
    );
    expect(switchboardBaseOf("http://sb.test/")).toBe("http://sb.test");
  });
});
