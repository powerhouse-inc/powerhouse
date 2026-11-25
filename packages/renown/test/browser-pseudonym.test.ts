import {
  addressOfKey,
  parsePrivateKey,
  parsePseudonymFile,
} from "@powerhousedao/shared/clis/identity";
import { describe, expect, it } from "vitest";
import {
  anonymousLabel,
  enrolBrowserCredential,
  ensureBrowserPseudonym,
  issueBrowserCredential,
  readBrowserPseudonym,
  type BrowserPseudonymFile,
  type PseudonymStore,
} from "../src/browser-pseudonym.js";
import { Renown, RenownMemoryStorage } from "../src/common.js";
import { recoverCredentialRecordRequestSigner } from "../src/credential-enrolment.js";
import { verifyCredentialSignature } from "../src/credential.js";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "../src/crypto/index.js";
import { MemoryEventEmitter } from "../src/event/memory.js";

/** As `BrowserKeyStorage` keeps it: the first file added wins. */
function memoryStore(): PseudonymStore & { kept?: unknown } {
  const store: PseudonymStore & { kept?: unknown } = {
    loadPseudonym: () => Promise.resolve(store.kept),
    addPseudonym: (file) => {
      store.kept ??= file;
      return Promise.resolve(store.kept);
    },
  };
  return store;
}

const SESSION = "did:key:zDnaeBrowserSession";
const DAY_MS = 86_400_000;

describe("the browser pseudonym", () => {
  it("is made once, in the form ph reads, and kept", async () => {
    const store = memoryStore();
    expect(await readBrowserPseudonym(store)).toBeUndefined();

    const made = await ensureBrowserPseudonym(store);
    expect(made.label).toBe(anonymousLabel(made.address));
    expect(made.label).toMatch(
      /^Anonymous 0x[0-9a-fA-F]{4}\.\.\.[0-9a-fA-F]{4}$/,
    );
    const again = await ensureBrowserPseudonym(store);
    expect(again.address).toBe(made.address);

    // `ph` reads the same file: its address is the key's.
    const file = parsePseudonymFile(JSON.stringify(store.kept));
    expect(file.address).toBe(made.address);
    expect(file.key.type).toBe("plain");
    const privateKey = (file.key as { privateKey: string }).privateKey;
    expect(addressOfKey(parsePrivateKey(privateKey))).toBe(made.address);
  });

  it("takes the one another tab kept first", async () => {
    const store = memoryStore();
    const first = await ensureBrowserPseudonym(memoryStore());
    store.addPseudonym = () => Promise.resolve(first.file);
    const made = await ensureBrowserPseudonym(store);
    expect(made.address).toBe(first.address);
  });

  it("ignores what is not a plain pseudonym file", async () => {
    const store = memoryStore();
    store.kept = { format: "ph-pseudonym", version: 1, address: "0x1" };
    expect(await readBrowserPseudonym(store)).toBeUndefined();
  });

  it("signs a 30-day credential labelled connect for the session key", async () => {
    const pseudonym = await ensureBrowserPseudonym(memoryStore());
    const credential = await issueBrowserCredential(pseudonym, {
      sessionDid: SESSION,
      chainId: 1,
    });
    expect(credential.issuer.ethereumAddress).toBe(pseudonym.address);
    expect(credential.credentialSubject).toEqual({
      id: SESSION,
      app: "connect",
    });
    expect(await verifyCredentialSignature(credential)).toBe(true);
    const days =
      (Date.parse(credential.expirationDate!) -
        Date.parse(credential.issuanceDate)) /
      DAY_MS;
    expect(Math.round(days)).toBe(30);
  });

  it("enrols at each host by a request it signs, and reports one it cannot reach", async () => {
    const pseudonym = await ensureBrowserPseudonym(memoryStore());
    const credential = await issueBrowserCredential(pseudonym, {
      sessionDid: SESSION,
    });
    const enrolled: unknown[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.host === "down.test") throw new TypeError("Failed to fetch");
      if (url.pathname.endsWith("/credentials/challenge")) {
        return Response.json({
          host: "did:key:zHost",
          nonce: "n1",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      const body = JSON.parse(String(init?.body)) as {
        request: Parameters<typeof recoverCredentialRecordRequestSigner>[0];
        signature: string;
      };
      expect(
        await recoverCredentialRecordRequestSigner(
          body.request,
          body.signature,
          1,
        ),
      ).toBe(pseudonym.address);
      enrolled.push({ at: url.origin, ...body.request });
      return Response.json({
        id: "record",
        expiresAt: credential.expirationDate,
      });
    };

    const outcomes = await enrolBrowserCredential({
      pseudonym,
      credential,
      hosts: ["http://sb.test", "http://down.test", "http://sb.test"],
      fetch,
    });
    expect(outcomes).toEqual([
      { host: "http://sb.test", ok: true },
      { host: "http://down.test", ok: false, error: "Failed to fetch" },
    ]);
    expect(enrolled).toEqual([
      {
        at: "http://sb.test",
        action: "enrol",
        host: "did:key:zHost",
        nonce: "n1",
        sessionDid: SESSION,
        credentialId: credential.id,
      },
    ]);
  });

  it("is adopted as this browser's identity", async () => {
    const crypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const renown = new Renown(
      new RenownMemoryStorage(),
      new MemoryEventEmitter(),
      crypto,
      "connect",
    );
    const pseudonym = await ensureBrowserPseudonym(memoryStore());
    const credential = await issueBrowserCredential(pseudonym, {
      sessionDid: renown.did,
    });
    const user = await renown.adoptCredential(credential, {
      local: true,
      localIdentity: "browser",
    });
    expect(user).toMatchObject({
      address: pseudonym.address,
      local: true,
      localIdentity: "browser",
    });
    expect(renown.signer.user?.address).toBe(pseudonym.address);
  });
});

describe("RenownCryptoSigner.ensureUser", () => {
  const action = () => ({
    id: "action-1",
    type: "TEST",
    timestampUtcMs: new Date().toISOString(),
    input: {},
    scope: "global",
  });
  const target = { documentId: "doc", branch: "main" };

  it("signs as the user it signs in, asked once nobody is", async () => {
    const crypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const signer = new RenownCryptoSigner(crypto, "connect");
    let asked = 0;
    signer.ensureUser = () => {
      asked++;
      signer.user = { address: "0xabc", networkId: "eip155", chainId: 1 };
      return Promise.resolve();
    };
    await signer.signAction(action(), target);
    expect(asked).toBe(1);
    expect(signer.user?.address).toBe("0xabc");
    await signer.signAction(action(), target);
    expect(asked).toBe(1);
  });

  it("signs anonymously when nobody could be signed in", async () => {
    const crypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const signer = new RenownCryptoSigner(crypto, "connect");
    signer.ensureUser = () => Promise.reject(new Error("no storage"));
    const warn = console.warn;
    console.warn = () => {};
    try {
      await expect(signer.signAction(action(), target)).resolves.toBeDefined();
    } finally {
      console.warn = warn;
    }
    expect(signer.user).toBeUndefined();
  });
});

// The file type stays the plain variant of ph's own.
const _plain: BrowserPseudonymFile["key"]["type"] = "plain";
void _plain;
