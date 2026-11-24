import {
  BrowserRenownEventEmitter,
  carriedCredentialOf,
  ensureBrowserPseudonym,
  issueBrowserCredential,
  MemoryKeyStorage,
  Renown,
  RenownCryptoBuilder,
  RenownMemoryStorage,
  type PowerhouseVerifiableCredential,
  type PseudonymStore,
} from "@renown/sdk";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { addLocalSignInEventHandler } from "../../src/hooks/local-sign-in.js";
import { getPHStore } from "../../src/hooks/ph-store.js";
import {
  createLocalSignIn,
  credentialRefusalHandler,
  localSignInAvailable,
  type LocalSignIn,
} from "../../src/renown/local-sign-in.js";
import type { LocalSignInState } from "../../src/types/global.js";

/* Sign-in by link, the page's side (F3d): the page exchanges a link's code at
   the loopback endpoint of the server that serves it, adopts the credential as
   this computer's identity, renews it there, and drops it when a switchboard
   refuses it for good. The endpoint here is a fake fetch. */

const DAY_MS = 86_400_000;
const ORIGIN = "http://localhost:3000";

function memoryStore(): PseudonymStore {
  let kept: unknown;
  return {
    loadPseudonym: () => Promise.resolve(kept),
    addPseudonym: (file) => {
      kept ??= file;
      return Promise.resolve(kept);
    },
  };
}

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

/** What the computer's identity signs: a credential for the page's key. */
const person = await ensureBrowserPseudonym(memoryStore());
function credentialFor(sessionDid: string, days = 30) {
  return issueBrowserCredential(person, { sessionDid, expiresInDays: days });
}

type Call = { url: string; body: Record<string, unknown>; bearer?: string };

/** The endpoint: answers each POST with `answer(route, body)`. */
function endpoint(
  answer: (
    route: string,
    call: Call,
  ) => Promise<{ status: number; body: unknown }> | undefined,
) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const call: Call = {
      url,
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      ...(headers.get("authorization")
        ? { bearer: headers.get("authorization")!.replace(/^Bearer /, "") }
        : {}),
    };
    calls.push(call);
    const route = new URL(url).pathname.replace(/^.*__ph\//, "");
    const reply = await answer(route, call);
    if (!reply) throw new TypeError("Failed to fetch");
    return Response.json(reply.body, { status: reply.status });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function state(): LocalSignInState | undefined {
  return getPHStore()?.localSignIn;
}

let signIn: LocalSignIn | undefined;

beforeAll(() => {
  addLocalSignInEventHandler();
});

beforeEach(() => {
  window.ph = {};
});

afterEach(() => {
  signIn?.stop();
  signIn = undefined;
  window.ph = {};
});

describe("sign-in by link", () => {
  it("exchanges the link's code and signs in as this computer's identity", async () => {
    const renown = await newRenown();
    const { fetch, calls } = endpoint(async (route, call) => ({
      status: 200,
      body: {
        ok: true,
        credential: await credentialFor(String(call.body.sessionDid)),
        identity: { kind: "pseudonym", address: person.address, label: "x" },
        expiresAt: "",
        renewFrom: "",
        sessions: [],
      },
    }));
    signIn = createLocalSignIn({ renown, base: "/", origin: ORIGIN, fetch });

    await signIn.start({ kind: "sign-in", code: "code-1" });

    expect(calls).toEqual([
      {
        url: `${ORIGIN}/__ph/sign-in`,
        body: { code: "code-1", sessionDid: renown.did },
      },
    ]);
    expect(renown.user).toMatchObject({
      address: person.address,
      local: true,
      localIdentity: "machine",
    });
    // Signs and bears as that identity.
    expect(renown.signer.user?.address).toBe(person.address);
    expect(state()).toBeUndefined();
  });

  it("asks the password the key is locked with, and keeps the code for it", async () => {
    const renown = await newRenown();
    const { fetch, calls } = endpoint(async (_route, call) =>
      call.body.password === "secret"
        ? {
            status: 200,
            body: {
              ok: true,
              credential: await credentialFor(renown.did),
              expiresAt: "",
              renewFrom: "",
            },
          }
        : call.body.password === undefined
          ? { status: 423, body: { reason: "password-required" } }
          : { status: 401, body: { reason: "wrong-password", triesLeft: 4 } },
    );
    signIn = createLocalSignIn({ renown, base: "/", origin: ORIGIN, fetch });

    await signIn.start({ kind: "sign-in", code: "code-1" });
    const asked = state();
    expect(asked?.status).toBe("password");
    expect(renown.user).toBeUndefined();

    await (asked as { submit(p: string): Promise<void> }).submit("wrong");
    expect(state()).toMatchObject({ status: "password", triesLeft: 4 });

    await (state() as { submit(p: string): Promise<void> }).submit("secret");
    expect(renown.user?.localIdentity).toBe("machine");
    expect(state()).toBeUndefined();
    expect(calls.map((call) => call.body)).toEqual([
      { code: "code-1", sessionDid: renown.did },
      { code: "code-1", sessionDid: renown.did, password: "wrong" },
      { code: "code-1", sessionDid: renown.did, password: "secret" },
    ]);
  });

  it("says why a link was refused, and keeps whoever was signed in", async () => {
    const renown = await newRenown();
    await renown.adoptCredential(await credentialFor(renown.did), {
      local: true,
      localIdentity: "browser",
    });
    const { fetch } = endpoint(() =>
      Promise.resolve({ status: 401, body: { reason: "used-code" } }),
    );
    signIn = createLocalSignIn({ renown, base: "/", origin: ORIGIN, fetch });

    await signIn.start({ kind: "sign-in", code: "used" });

    expect(state()).toMatchObject({ status: "failed", reason: "used-code" });
    expect(renown.user?.localIdentity).toBe("browser");
  });

  it("signs out with #ph-sign-out", async () => {
    const renown = await newRenown();
    await renown.adoptCredential(await credentialFor(renown.did), {
      local: true,
      localIdentity: "machine",
    });
    const { fetch, calls } = endpoint(() => undefined);
    signIn = createLocalSignIn({ renown, base: "/", origin: ORIGIN, fetch });

    await signIn.start({ kind: "sign-out" });

    expect(renown.user).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("renews at boot once under seven days remain, with a bearer carrying the credential", async () => {
    const renown = await newRenown();
    const old = await credentialFor(renown.did, 3);
    await renown.adoptCredential(old, {
      local: true,
      localIdentity: "machine",
    });
    const renewed = await credentialFor(renown.did, 30);
    const { fetch, calls } = endpoint(() =>
      Promise.resolve({
        status: 200,
        body: { ok: true, credential: renewed, expiresAt: "", renewFrom: "" },
      }),
    );
    signIn = createLocalSignIn({ renown, base: "/", origin: ORIGIN, fetch });

    await signIn.start(undefined);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ORIGIN}/__ph/renew`);
    const claims = await renown.verifyBearerToken(calls[0].bearer!);
    expect(claims).not.toBe(false);
    expect(carriedCredentialOf(claims as never)?.id).toBe(old.id);
    expect(renown.user?.credential?.id).toBe(renewed.id);
  });

  it("leaves a credential with more than seven days alone", async () => {
    const renown = await newRenown();
    const credential = await credentialFor(renown.did, 20);
    await renown.adoptCredential(credential, {
      local: true,
      localIdentity: "machine",
    });
    const { fetch, calls } = endpoint(() => undefined);
    signIn = createLocalSignIn({ renown, base: "/", origin: ORIGIN, fetch });

    await signIn.renew();

    expect(calls).toEqual([]);
    expect(renown.user?.credential?.id).toBe(credential.id);
  });

  it("keeps the credential while the server does not run", async () => {
    const renown = await newRenown();
    const credential = await credentialFor(renown.did, 3);
    await renown.adoptCredential(credential, {
      local: true,
      localIdentity: "machine",
    });
    const { fetch } = endpoint(() => undefined);
    signIn = createLocalSignIn({ renown, base: "/", origin: ORIGIN, fetch });

    await signIn.renew();

    expect(renown.user?.credential?.id).toBe(credential.id);
    expect(state()).toBeUndefined();
  });

  it("drops a credential the server withdrew, and says how to get a fresh link", async () => {
    const renown = await newRenown();
    await renown.adoptCredential(await credentialFor(renown.did, 3), {
      local: true,
      localIdentity: "machine",
    });
    const { fetch } = endpoint(() =>
      Promise.resolve({ status: 401, body: { reason: "withdrawn" } }),
    );
    signIn = createLocalSignIn({ renown, base: "/", origin: ORIGIN, fetch });

    await signIn.renew();

    expect(renown.user).toBeUndefined();
    expect(state()).toEqual({ status: "ended", reason: "withdrawn" });
  });

  it("drops a credential past its date at boot", async () => {
    const renown = await newRenown();
    const credential = await credentialFor(renown.did, 1);
    await renown.adoptCredential(credential, {
      local: true,
      localIdentity: "machine",
    });
    const { fetch, calls } = endpoint(() => undefined);
    signIn = createLocalSignIn({
      renown,
      base: "/",
      origin: ORIGIN,
      fetch,
      now: () => Date.now() + 2 * DAY_MS,
    });

    await signIn.start(undefined);

    expect(renown.user).toBeUndefined();
    expect(state()).toEqual({ status: "ended", reason: "expired" });
    expect(calls).toEqual([]);
  });

  it("finds the endpoint only where a local server answers it", async () => {
    const answering = vi.fn(() =>
      Promise.resolve(Response.json({ available: true })),
    );
    expect(
      await localSignInAvailable({
        base: "/app/",
        origin: ORIGIN,
        fetch: answering as unknown as typeof fetch,
      }),
    ).toBe(true);
    expect(String((answering.mock.calls[0] as unknown[])[0])).toBe(
      `${ORIGIN}/app/__ph/sign-in`,
    );
    // A hosted server answers its index page.
    const hosted = vi.fn(() =>
      Promise.resolve(new Response("<!doctype html>", { status: 200 })),
    );
    expect(
      await localSignInAvailable({
        base: "/",
        origin: ORIGIN,
        fetch: hosted as unknown as typeof fetch,
      }),
    ).toBe(false);
  });
});

describe("a credential a switchboard refuses", () => {
  it("is dropped for good reasons, and the request goes again anonymously", async () => {
    const renown = await newRenown();
    const drop = vi.fn(() => Promise.resolve());
    const handle = credentialRefusalHandler({ renown, localSignIn: { drop } });
    for (const reason of [
      "expired",
      "withdrawn-here",
      "withdrawn-at-renown",
      "bad-credential",
    ]) {
      expect(await handle({ reason })).toBe("anonymous");
    }
    expect(drop).toHaveBeenCalledTimes(4);
    expect(await handle({ reason: "unverifiable" })).toBeUndefined();
  });

  it("enrols the browser's pseudonym where it is not registered, and goes again", async () => {
    const renown = await newRenown();
    await renown.adoptCredential(
      (await credentialFor(renown.did)) as PowerhouseVerifiableCredential,
      { local: true, localIdentity: "browser" },
    );
    const enrolAt = vi.fn(() => Promise.resolve(true));
    const handle = credentialRefusalHandler({
      renown,
      localSignIn: { drop: vi.fn() },
      browserIdentity: { enrolAt },
    });
    expect(
      await handle({ reason: "not-registered", url: "http://sb.test/graphql" }),
    ).toBe("again");
    expect(enrolAt).toHaveBeenCalledWith("http://sb.test/graphql");
    enrolAt.mockResolvedValueOnce(false);
    expect(
      await handle({ reason: "not-registered", url: "http://sb.test/graphql" }),
    ).toBeUndefined();
  });
});
