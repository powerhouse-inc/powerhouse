// The door with the real verifier (D8): records in a temp data folder, Renown
// out of reach, real bearers and credentials; and the enrolment routes.
import {
  credentialRecordFile,
  readCredentialRecord,
  readCredentialWithdrawal,
  writeCredentialRecord,
  type CredentialBinding,
} from "@powerhousedao/shared/clis/credential-records";
import type { IHttpScope } from "@powerhousedao/shared/processors";
import {
  buildAndSignCredential,
  createCredentialVerifier,
  enrolCredential,
  MemoryKeyStorage,
  RenownCryptoBuilder,
  withdrawEnrolment,
  type CredentialVerifier,
  type IRenownCrypto,
  type PowerhouseVerifiableCredential,
  type SignCredentialTypedData,
} from "@renown/sdk/node";
import { mkdtempSync, rmSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountCredentialRoutes } from "../src/http/credential-routes.js";
import { AuthService } from "../src/services/auth.service.js";

// viem is the SDK's own dependency; reactor-api does not declare it.
type Account = {
  address: `0x${string}`;
  signTypedData(args: unknown): Promise<`0x${string}`>;
};
const { privateKeyToAccount } = createRequire(
  import.meta.resolve("@renown/sdk/node"),
)("viem/accounts") as {
  privateKeyToAccount: (key: `0x${string}`) => Account;
};

// Well-known Anvil dev keys; never used for anything real.
const PERSON = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const STRANGER = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const HOST = "did:key:zHostKey";

const signAs =
  (account: Account): SignCredentialTypedData =>
  (args) =>
    account.signTypedData(args);

const newKey = (): Promise<IRenownCrypto> =>
  new RenownCryptoBuilder().withKeyPairStorage(new MemoryKeyStorage()).build();

const credentialFor = (
  account: Account,
  key: string,
  days = 30,
): Promise<PowerhouseVerifiableCredential> =>
  buildAndSignCredential({
    signTypedData: signAs(account),
    address: account.address,
    chainId: 1,
    app: "agent X",
    appId: key,
    expiresInDays: days,
  });

let dataDir: string;
let verifiers: CredentialVerifier[] = [];

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "credential-door-"));
  // Renown is never reached: every ask fails as an outage would.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
});
afterEach(() => {
  for (const v of verifiers) v.close();
  verifiers = [];
  vi.restoreAllMocks();
  rmSync(dataDir, { recursive: true, force: true });
});

function door(enabled: boolean, refuseUnseenOffline = false) {
  const verifier = createCredentialVerifier({ dataDir, refuseUnseenOffline });
  verifiers.push(verifier);
  const service = new AuthService({
    enabled,
    resolveIdentity: true,
    admins: [],
    credentialVerificationCacheTtlMs: 0,
    verifyCredential: (p) =>
      verifier.check(
        {
          address: p.address,
          chainId: p.chainId,
          networkId: p.networkId ?? "eip155",
          sessionDid: p.appId,
        },
        p.credential,
      ),
  });
  verifier.onWithdrawn((c) =>
    service.invalidateCredential(c.address, c.chainId, c.sessionDid),
  );
  return service;
}

describe("the door, auth off", () => {
  it("names a caller whose bearer carries a recorded credential", async () => {
    const session = await newKey();
    const credential = await credentialFor(PERSON, session.did);
    writeCredentialRecord({ dataDir, credential, source: "cli" });
    const bearer = await session.getBearerToken(PERSON.address, {
      expiresIn: 60,
      credential,
    });
    const context = await door(false).verifyBearer(`Bearer ${bearer}`);
    expect(context).not.toBeInstanceOf(Response);
    expect(context).toMatchObject({
      auth_enabled: false,
      user: {
        address: PERSON.address,
        appKey: session.did,
        label: "agent X",
        via: "record",
      },
    });
  });

  it("refuses a bad bearer, and leaves a caller without one anonymous", async () => {
    const service = door(false);
    const session = await newKey();
    // Carries a credential for another key.
    const other = await credentialFor(PERSON, (await newKey()).did);
    const bearer = await session.getBearerToken(PERSON.address, {
      expiresIn: 60,
      credential: other,
    });
    const refused = await service.verifyBearer(`Bearer ${bearer}`);
    expect(refused).toBeInstanceOf(Response);
    expect((refused as Response).status).toBe(401);
    expect(await (refused as Response).json()).toMatchObject({
      reason: "bad-credential",
    });
    expect(await service.verifyBearer(undefined)).toMatchObject({
      user: undefined,
    });
  });

  it("accepts an unseen credential on its signature offline, unless told not to", async () => {
    const session = await newKey();
    const credential = await credentialFor(PERSON, session.did);
    const bearer = await session.getBearerToken(PERSON.address, {
      expiresIn: 60,
      credential,
    });
    expect(await door(false).verifyBearer(`Bearer ${bearer}`)).toMatchObject({
      user: { via: "signature" },
    });
    const refused = await door(false, true).verifyBearer(`Bearer ${bearer}`);
    expect((refused as Response).status).toBe(401);
  });

  it("drops a connection's credential when its record goes", async () => {
    const session = await newKey();
    const credential = await credentialFor(PERSON, session.did);
    const { id } = writeCredentialRecord({
      dataDir,
      credential,
      source: "cli",
    });
    const service = door(false);
    const bearer = await session.getBearerToken(PERSON.address, {
      expiresIn: 60,
    });
    const user = await service.authenticateWebSocketConnection({
      authorization: `Bearer ${bearer}`,
    });
    expect(user?.via).toBe("record");
    const invalidated = new Promise<string>((resolve) =>
      service.onCredentialInvalidated((i) => resolve(i.address)),
    );
    rmSync(credentialRecordFile(dataDir, id));
    expect(await invalidated).toBe(PERSON.address.toLowerCase());
    expect(await service.isCredentialValid(user!)).toBe(false);
  });
});

describe("enrolment routes", () => {
  let server: Server;
  let hostUrl: string;
  let withdrawn: CredentialBinding[];

  beforeEach(async () => {
    vi.restoreAllMocks();
    withdrawn = [];
    type Handler = (
      req: IncomingMessage,
      res: ServerResponse,
      ctx: unknown,
    ) => void | Promise<void>;
    const handlers = new Map<string, Handler>();
    const scope = {
      nodeRoute: (spec: { method: string; path: string; handler: Handler }) => {
        handlers.set(`${spec.method} /credentials/${spec.path}`, spec.handler);
        return { url: "", dispose: () => undefined };
      },
    } as unknown as IHttpScope;
    mountCredentialRoutes(scope, {
      dataDir,
      hostDid: () => HOST,
      onWithdrawn: (binding) => withdrawn.push(binding),
    });
    server = createServer((req, res) => {
      const path = new URL(req.url ?? "/", "http://host").pathname;
      const handler = handlers.get(`${req.method} ${path}`);
      if (!handler) {
        res.statusCode = 404;
        res.end();
        return;
      }
      void handler(req, res, {});
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const address = server.address();
    hostUrl = `http://127.0.0.1:${typeof address === "object" ? address?.port : 0}/`;
  });
  afterEach(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );

  const post = (route: string, body: unknown) =>
    fetch(new URL(route, hostUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("keeps a record the credential's issuer asks for, and withdraws it", async () => {
    const credential = await credentialFor(PERSON, "did:key:zBrowser");
    const enrolled = await enrolCredential({
      hostUrl,
      credential,
      signTypedData: signAs(PERSON),
    });
    expect(readCredentialRecord({ dataDir, id: enrolled.id })).toMatchObject({
      source: "enrolled",
      label: "agent X",
    });

    const result = await withdrawEnrolment({
      hostUrl,
      chainId: 1,
      signTypedData: signAs(PERSON),
    });
    expect(result.withdrawn).toEqual([enrolled.id]);
    expect(readCredentialRecord({ dataDir, id: enrolled.id })).toBeUndefined();
    expect(readCredentialWithdrawal({ dataDir, id: enrolled.id })?.by).toBe(
      "request",
    );
    expect(withdrawn.map((b) => b.sessionDid)).toEqual(["did:key:zBrowser"]);

    // A withdrawn credential is not enrolled again.
    await expect(
      enrolCredential({ hostUrl, credential, signTypedData: signAs(PERSON) }),
    ).rejects.toThrow(/withdrawn/);
  });

  it("refuses a request signed by another key, for another host, or replayed", async () => {
    const credential = await credentialFor(PERSON, "did:key:zBrowser");
    await expect(
      enrolCredential({ hostUrl, credential, signTypedData: signAs(STRANGER) }),
    ).rejects.toThrow(/issuer/);

    const challenge = async () =>
      (await (
        await fetch(new URL("credentials/challenge", hostUrl))
      ).json()) as {
        host: string;
        nonce: string;
      };
    const { signCredentialRecordRequest } = await import("@renown/sdk/node");
    const { nonce } = await challenge();
    const elsewhere = {
      action: "enrol" as const,
      host: "did:key:zOtherHost",
      nonce,
      sessionDid: "did:key:zBrowser",
      credentialId: credential.id,
    };
    const response = await post("credentials/enrol", {
      credential,
      request: elsewhere,
      signature: await signCredentialRecordRequest(
        signAs(PERSON),
        elsewhere,
        1,
      ),
    });
    expect(response.status).toBe(400);

    const fresh = await challenge();
    const request = { ...elsewhere, host: HOST, nonce: fresh.nonce };
    const body = {
      credential,
      request,
      signature: await signCredentialRecordRequest(signAs(PERSON), request, 1),
    };
    expect((await post("credentials/enrol", body)).status).toBe(201);
    expect((await post("credentials/enrol", body)).status).toBe(400);
  });

  it("limits how often one client enrols", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      statuses.push((await post("credentials/enrol", {})).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 400)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
