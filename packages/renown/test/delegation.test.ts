import type {
  Action,
  ActionSigner,
  Signature,
} from "@powerhousedao/shared/document-model";
import { fromString, toString } from "uint8arrays";
import { privateKeyToAccount } from "viem/accounts";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  buildAndSignCredential,
  checkDelegationCredential,
  type SignCredentialTypedData,
} from "../src/credential.js";
import { MemoryKeyStorage } from "../src/crypto/memory-key-storage.js";
import { RenownCryptoBuilder } from "../src/crypto/renown-crypto-builder.js";
import type { RenownCrypto } from "../src/crypto/renown-crypto.js";
import {
  createDelegation,
  decodeDelegation,
  delegationBinding,
  DELEGATION_JWT_TYPE,
  delegationOf,
  signDelegatedAction,
  verifyDelegation,
} from "../src/delegation.js";
import { createRenownTrustPolicy } from "../src/signer-trust.js";
import type { PowerhouseVerifiableCredential } from "../src/types.js";
import { verifyAuthBearerToken } from "../src/utils.js";

// Well-known Anvil dev keys; never used for anything real.
const person = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const stranger = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

const TARGET = { documentId: "doc-1", branch: "main" };
const USER = { address: person.address, networkId: "eip155", chainId: 1 };
const SCOPE = { ops: ["PUBLISH_WORKFLOW"], res: "sektar/integration:i-1" };
const HOUR = 60 * 60;

const signWith =
  (signer: typeof person): SignCredentialTypedData =>
  (args) =>
    signer.signTypedData(args as Parameters<typeof signer.signTypedData>[0]);

const newKey = (): Promise<RenownCrypto> =>
  new RenownCryptoBuilder().withKeyPairStorage(new MemoryKeyStorage()).build();

const credentialFor = (
  appId: string,
  signer = person,
  expiresInDays = 7,
): Promise<PowerhouseVerifiableCredential> =>
  buildAndSignCredential({
    signTypedData: signWith(signer),
    address: signer.address,
    chainId: 1,
    app: "connect",
    appId,
    expiresInDays,
  });

const publish = (timestampUtcMs = new Date().toISOString()): Action => ({
  id: "01890000-0000-7000-8000-000000000001",
  type: "PUBLISH_WORKFLOW",
  timestampUtcMs,
  input: { publishedAt: timestampUtcMs },
  scope: "global",
});

const signerOf = (action: Action): ActionSigner => action.context!.signer!;

/** Re-signs a payload under `key` with the header a statement has. */
async function forge(
  key: RenownCrypto,
  claims: Record<string, unknown>,
): Promise<string> {
  const encode = (value: unknown) =>
    toString(fromString(JSON.stringify(value)), "base64url");
  const input = `${encode({ alg: "ES256", typ: DELEGATION_JWT_TYPE })}.${encode(claims)}`;
  const signature = await key.issuer.signer(input);
  return `${input}.${signature as string}`;
}

/** The same statement with its payload changed and its signature kept. */
function tampered(statement: string, change: Record<string, unknown>): string {
  const [header, payload, signature] = statement.split(".");
  const claims = JSON.parse(
    toString(fromString(payload, "base64url")),
  ) as object;
  const edited = toString(
    fromString(JSON.stringify({ ...claims, ...change })),
    "base64url",
  );
  return `${header}.${edited}.${signature}`;
}

describe("delegation", () => {
  let session: RenownCrypto;
  let delegate: RenownCrypto;
  let thief: RenownCrypto;
  let host: RenownCrypto;
  let credential: PowerhouseVerifiableCredential;
  let statement: string;
  const fetchSpy = vi.fn();

  const statementFor = (
    overrides: Partial<Parameters<typeof createDelegation>[0]> = {},
  ) =>
    createDelegation({
      issuer: session.issuer,
      credential,
      delegate: delegate.did,
      environment: host.did,
      scope: SCOPE,
      ...overrides,
    });

  const sign = (
    action: Action,
    with_: { crypto?: RenownCrypto; statement?: string } = {},
  ) =>
    signDelegatedAction({
      action,
      target: TARGET,
      crypto: with_.crypto ?? delegate,
      appName: "test-runner",
      user: USER,
      statement: with_.statement ?? statement,
    });

  const verify = (
    jwt: string,
    params: Partial<Parameters<typeof verifyDelegation>[1]> = {},
  ) =>
    verifyDelegation(jwt, {
      user: USER,
      key: delegate.did,
      signedAt: Math.floor(Date.now() / 1000),
      actionType: "PUBLISH_WORKFLOW",
      ...params,
    });

  const policy = (options = {}) =>
    createRenownTrustPolicy({
      self: { key: host.did, user: { address: "", networkId: "", chainId: 0 } },
      delegationOnly: true,
      ...options,
    });

  const FIRST_WRITE = {
    path: "mutation",
    actionType: "PUBLISH_WORKFLOW",
  } as const;
  const LOAD = { path: "load", actionType: "PUBLISH_WORKFLOW" } as const;

  beforeAll(async () => {
    session = await newKey();
    delegate = await newKey();
    thief = await newKey();
    host = await newKey();
    credential = await credentialFor(session.did);
    statement = await statementFor();
  });

  beforeEach(() => {
    // Everything below is offline: any network call fails the test.
    fetchSpy.mockReset();
    fetchSpy.mockRejectedValue(new Error("no network in this test"));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("the statement", () => {
    it("names the chain, carries the credential and verifies with no network", async () => {
      const claims = decodeDelegation(statement)!;
      expect(claims).toMatchObject({
        iss: session.did,
        aud: delegate.did,
        sub: credential.issuer.id,
        env: host.did,
        scp: SCOPE,
      });
      expect(claims.prf.proof.proofValue).toBe(credential.proof.proofValue);
      expect((await verify(statement)).ok).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("is not accepted as a bearer token", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      expect(await verifyAuthBearerToken(statement)).toBe(false);
      consoleError.mockRestore();
    });

    it("refuses a bearer token as a statement", async () => {
      const bearer = await session.getBearerToken(person.address, {
        expiresIn: 600,
      });
      const verdict = await verify(bearer);
      expect(verdict.ok).toBe(false);
    });
  });

  describe("attacks", () => {
    it("refuses a stolen statement used by another key", async () => {
      const verdict = await verify(statement, { key: thief.did });
      expect(verdict).toMatchObject({ ok: false });
      const stolen = await sign(publish(), { crypto: thief });
      expect(
        await policy().authorizeSigner(
          signerOf(stolen),
          thief.did,
          TARGET.documentId,
          FIRST_WRITE,
        ),
      ).toBe(false);
    });

    it("refuses a third link: the delegate holds no credential", async () => {
      const onward = await newKey();
      const third = await createDelegation({
        issuer: delegate.issuer,
        credential,
        delegate: onward.did,
        environment: host.did,
        scope: SCOPE,
      });
      const verdict = await verify(third, { key: onward.did });
      expect(verdict).toMatchObject({ ok: false });
    });

    it("refuses a third link that carries the second as its proof", async () => {
      const onward = await newKey();
      const claims = decodeDelegation(statement)!;
      const third = await forge(delegate, {
        ...claims,
        iss: delegate.did,
        aud: onward.did,
        prf: statement,
      });
      expect((await verify(third, { key: onward.did })).ok).toBe(false);
    });

    it("refuses a statement whose issuer has no credential", async () => {
      const claims = decodeDelegation(statement)!;
      const unbacked = await forge(thief, { ...claims, iss: thief.did });
      expect((await verify(unbacked)).ok).toBe(false);
    });

    it("refuses a credential of another person", async () => {
      const theirs = await credentialFor(session.did, stranger);
      const claims = decodeDelegation(statement)!;
      const swapped = await forge(session, { ...claims, prf: theirs });
      expect((await verify(swapped)).ok).toBe(false);
    });

    it("refuses a forged credential proof", async () => {
      const claims = decodeDelegation(statement)!;
      const forged = await forge(session, {
        ...claims,
        prf: {
          ...credential,
          proof: { ...credential.proof, proofValue: `0x${"11".repeat(65)}` },
        },
      });
      expect((await verify(forged)).ok).toBe(false);
    });

    it("refuses a claim to act as someone else", async () => {
      const verdict = await verify(statement, {
        user: { ...USER, address: stranger.address },
      });
      expect(verdict.ok).toBe(false);
    });

    it("refuses scope widening by editing the statement", async () => {
      const wider = tampered(statement, {
        scp: { ops: ["PUBLISH_WORKFLOW", "DELETE_DOCUMENT"], res: "*" },
      });
      expect((await verify(wider)).ok).toBe(false);
    });

    it("refuses scope widening by the delegate issuing its own", async () => {
      const claims = decodeDelegation(statement)!;
      const own = await forge(delegate, {
        ...claims,
        iss: delegate.did,
        scp: { ops: ["DELETE_DOCUMENT"], res: "*" },
      });
      expect((await verify(own, { actionType: "DELETE_DOCUMENT" })).ok).toBe(
        false,
      );
    });

    it.each([
      ["an operation that cannot be delegated", ["DELETE_DOCUMENT"]],
      ["a wildcard", ["*"]],
      ["no operations", []],
    ])("refuses a genuine statement naming %s", async (_name, ops) => {
      const jwt = await statementFor({ scope: { ops, res: SCOPE.res } });
      const verdict = await verify(jwt, { actionType: ops[0] ?? "ANY" });
      expect(verdict.ok).toBe(false);
    });

    it("refuses an action type outside the scope", async () => {
      const verdict = await verify(statement, {
        actionType: "SET_WORKFLOW_STATUS",
      });
      expect(verdict).toMatchObject({ ok: false });
    });

    it("refuses a stripped statement once the tuple names it", async () => {
      const signed = await sign(publish());
      const signer = signerOf(signed);
      const stripped = {
        ...signer,
        signatures: signer.signatures.slice(-1),
      };
      expect(
        await policy().authorizeSigner(
          stripped,
          delegate.did,
          TARGET.documentId,
          LOAD,
        ),
      ).toBe(false);
    });

    it("refuses another genuine statement swapped in by a relay", async () => {
      const signed = await sign(publish());
      const signer = signerOf(signed);
      const other = await statementFor();
      const swapped = {
        ...signer,
        signatures: [
          ["dlg1", session.did, "", other, ""] as Signature,
          signer.signatures.at(-1)!,
        ],
      };
      expect(
        await policy().authorizeSigner(
          swapped,
          delegate.did,
          TARGET.documentId,
          LOAD,
        ),
      ).toBe(false);
    });

    it("refuses a statement added to a tuple that does not cover it", async () => {
      const signed = await sign(publish());
      const tuple = signerOf(signed).signatures.at(-1)!;
      const unbound: Signature = [tuple[0], tuple[1], tuple[2], "", tuple[4]];
      const signer = {
        ...signerOf(signed),
        signatures: [signerOf(signed).signatures[0], unbound],
      };
      expect(
        await policy().authorizeSigner(
          signer,
          delegate.did,
          TARGET.documentId,
          LOAD,
        ),
      ).toBe(false);
    });

    it("refuses a wrong environment at first write, and accepts it on load", async () => {
      const elsewhere = await newKey();
      const signed = await sign(publish(), {
        statement: await statementFor({ environment: elsewhere.did }),
      });
      const verdict = (context: typeof FIRST_WRITE | typeof LOAD) =>
        policy().authorizeSigner(
          signerOf(signed),
          delegate.did,
          TARGET.documentId,
          context,
        );
      expect(await verdict(FIRST_WRITE)).toBe(false);
      expect(await verdict(LOAD)).toBe(true);
    });

    it("refuses a statement at first write on a host with no key of its own", async () => {
      const signed = await sign(publish());
      const noKey = createRenownTrustPolicy({ delegationOnly: true });
      expect(
        await noKey.authorizeSigner(
          signerOf(signed),
          delegate.did,
          TARGET.documentId,
          FIRST_WRITE,
        ),
      ).toBe(false);
    });

    it("refuses when admission gives no context", async () => {
      const signed = await sign(publish());
      expect(
        await policy().authorizeSigner(
          signerOf(signed),
          delegate.did,
          TARGET.documentId,
        ),
      ).toBe(false);
    });
  });

  describe("the time rule", () => {
    const signedAt = () => Math.floor(Date.now() / 1000);

    it("judges expiry by the operation's own time, not the verifier's clock", async () => {
      const jwt = await statementFor({ lifetimeSeconds: HOUR });
      const claims = decodeDelegation(jwt)!;
      vi.useFakeTimers({ now: (claims.exp + 365 * 24 * HOUR) * 1000 });
      expect((await verify(jwt, { signedAt: claims.exp - 1 })).ok).toBe(true);
      expect((await verify(jwt, { signedAt: claims.exp })).ok).toBe(false);
    });

    it("refuses an operation signed long before the statement", async () => {
      const jwt = await statementFor();
      const verdict = await verify(jwt, { signedAt: signedAt() - HOUR });
      expect(verdict.ok).toBe(false);
    });

    it("tolerates the browser's clock running ahead of the host", async () => {
      const jwt = await statementFor();
      expect((await verify(jwt, { signedAt: signedAt() - 60 })).ok).toBe(true);
    });

    it("keeps working past the credential's own seven days", async () => {
      const shortLived = await credentialFor(session.did, person, 7);
      const jwt = await statementFor({ credential: shortLived });
      const later =
        Date.parse(shortLived.expirationDate!) + 30 * 24 * HOUR * 1000;
      vi.useFakeTimers({ now: later });
      const verdict = await verify(jwt, {
        signedAt: decodeDelegation(jwt)!.iat + 60,
      });
      expect(verdict.ok).toBe(true);
    });
  });

  describe("the trust policy", () => {
    const signer: ActionSigner = {
      user: USER,
      app: { name: "x", key: "did:key:zDnaeSomeone" },
      signatures: [["1", "did:key:zDnaeSomeone", "v2:x", "", "0x"]],
    };

    it("accepts a delegated publish with no lookup, whatever the mode", async () => {
      const signed = await sign(publish());
      for (const delegationOnly of [true, false]) {
        expect(
          await policy({ delegationOnly }).authorizeSigner(
            signerOf(signed),
            delegate.did,
            TARGET.documentId,
            FIRST_WRITE,
          ),
        ).toBe(true);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("leaves a signer with no statement alone in delegation-only mode", async () => {
      expect(delegationOf(signer)).toBeUndefined();
      expect(
        await policy().authorizeSigner(
          signer,
          signer.app.key,
          TARGET.documentId,
          FIRST_WRITE,
        ),
      ).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("still looks a signer with no statement up when enforcing", async () => {
      await expect(
        policy({ delegationOnly: false, refusalTtlMs: 0 }).authorizeSigner(
          signer,
          signer.app.key,
          TARGET.documentId,
          FIRST_WRITE,
        ),
      ).rejects.toThrow("no network");
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it("accepts the host's own key before anything else", async () => {
      const own = await sign(publish(), { crypto: host });
      expect(
        await createRenownTrustPolicy({
          self: { key: host.did, user: USER },
          delegationOnly: true,
        }).authorizeSigner(
          signerOf(own),
          host.did,
          TARGET.documentId,
          FIRST_WRITE,
        ),
      ).toBe(true);
    });
  });

  describe("the action", () => {
    it("keeps the signing tuple last, with the statement bound in element [3]", async () => {
      const signed = await sign(publish());
      const { signatures, app, user } = signerOf(signed);
      expect(signatures).toHaveLength(2);
      expect(signatures[0][0]).toBe("dlg1");
      expect(signatures[0][1]).toBe(session.did);
      expect(signatures[0][3]).toBe(statement);
      expect(signatures[1][1]).toBe(delegate.did);
      expect(signatures[1][3]).toBe(await delegationBinding(statement));
      expect(app.key).toBe(delegate.did);
      expect(user.address).toBe(person.address);
    });

    it("survives the transport's join and split", async () => {
      const signed = await sign(publish());
      const wire = signerOf(signed).signatures.map((s) => s.join(", "));
      const back = wire.map((s) => s.split(", "));
      expect(back).toEqual(signerOf(signed).signatures);
    });

    it("stays small enough to carry on a publish", async () => {
      const signed = await sign(publish());
      const size = JSON.stringify(signerOf(signed).signatures).length;
      expect(size).toBeLessThan(5_000);
    });
  });

  describe("checkDelegationCredential", () => {
    const check = (expirationDate?: string) =>
      checkDelegationCredential({
        address: person.address,
        chainId: 1,
        appDid: session.did,
        expirationDate,
      });
    const reply = (status: number, body: unknown) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
      });

    it("answers active for a credential Renown serves", async () => {
      fetchSpy.mockResolvedValue(reply(200, { credential }));
      expect((await check()).status).toBe("active");
    });

    it("answers unknown when Renown cannot be reached", async () => {
      fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
      expect((await check()).status).toBe("unknown");
    });

    it.each([500, 502, 503, 429])(
      "answers unknown for a %i, never revoked",
      async (status) => {
        fetchSpy.mockResolvedValue(reply(status, { error: "down" }));
        expect((await check()).status).toBe("unknown");
      },
    );

    it("answers unknown for a proxy's 404 page", async () => {
      fetchSpy.mockResolvedValue(reply(404, "<html>not found</html>"));
      expect((await check()).status).toBe("unknown");
    });

    it("answers unknown when the proof does not verify", async () => {
      fetchSpy.mockResolvedValue(
        reply(200, {
          credential: {
            ...credential,
            proof: { ...credential.proof, proofValue: `0x${"22".repeat(65)}` },
          },
        }),
      );
      expect((await check()).status).toBe("unknown");
    });

    it("answers revoked when Renown has dropped one not yet expired", async () => {
      fetchSpy.mockResolvedValue(reply(404, { error: "not found" }));
      const future = new Date(Date.now() + 24 * HOUR * 1000).toISOString();
      expect((await check(future)).status).toBe("revoked");
    });

    it("answers expired when the credential is past its date", async () => {
      fetchSpy.mockResolvedValue(reply(404, { error: "not found" }));
      const past = new Date(Date.now() - 24 * HOUR * 1000).toISOString();
      expect((await check(past)).status).toBe("expired");
    });
  });
});
