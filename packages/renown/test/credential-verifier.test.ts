import {
  credentialRecordFile,
  credentialWithdrawalFile,
  readCredentialRecordLastUsed,
  readCredentialWithdrawal,
  writeCredentialRecord,
  withdrawCredentialRecords,
} from "@powerhousedao/shared/clis/credential-records";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { carriedCredentialOf } from "../src/carried-credential.js";
import {
  CREDENTIAL_ROUTES,
  recoverCredentialRecordRequestSigner,
  signCredentialRecordRequest,
  type CredentialRecordRequest,
} from "../src/credential-enrolment.js";
import {
  checkCredentialFor,
  createCredentialVerifier,
  type CredentialClaim,
  type CredentialVerifier,
} from "../src/credential-verifier.js";
import {
  buildAndSignCredential,
  verifyCredentialSignature,
  type SignCredentialTypedData,
} from "../src/credential.js";
import { MemoryKeyStorage, RenownCryptoBuilder } from "../src/crypto/index.js";
import { resolveActiveIdentity } from "../src/identity.js";
import type { PowerhouseVerifiableCredential } from "../src/types.js";
import { verifyAuthBearerToken } from "../src/utils.js";

// Well-known Anvil dev keys; never used for anything real.
const person = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const stranger = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const signAs =
  (account: typeof person): SignCredentialTypedData =>
  (args) =>
    account.signTypedData(args as Parameters<typeof account.signTypedData>[0]);

const SESSION = "did:key:zDnaeSessionKey";

const claim = (over: Partial<CredentialClaim> = {}): CredentialClaim => ({
  address: person.address,
  chainId: 1,
  networkId: "eip155",
  sessionDid: SESSION,
  ...over,
});

const issue = (
  o: { session?: string; days?: number; account?: typeof person } = {},
): Promise<PowerhouseVerifiableCredential> =>
  buildAndSignCredential({
    signTypedData: signAs(o.account ?? person),
    address: (o.account ?? person).address,
    chainId: 1,
    app: "agent X",
    appId: o.session ?? SESSION,
    expiresInDays: o.days ?? 30,
  });

// A fresh Response per call: a body is read once.
const reply = (status: number, body: unknown) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

let dataDir: string;
let fetchSpy: MockInstance<typeof fetch>;
const verifiers: CredentialVerifier[] = [];
const verifier = (
  o: Partial<Parameters<typeof createCredentialVerifier>[0]> = {},
) => {
  const v = createCredentialVerifier({ dataDir, timeoutMs: 500, ...o });
  verifiers.push(v);
  return v;
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renown-verifier-"));
  fetchSpy = vi.spyOn(globalThis, "fetch");
  fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
});
afterEach(() => {
  for (const v of verifiers.splice(0)) v.close();
  fetchSpy.mockRestore();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("createCredentialVerifier: records", () => {
  it("accepts a record without asking Renown, with its label", async () => {
    writeCredentialRecord({
      dataDir,
      credential: await issue(),
      source: "cli",
    });
    expect(await verifier().check(claim())).toMatchObject({
      ok: true,
      via: "record",
      label: "agent X",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a removed record at the next check, and keeps the withdrawal", async () => {
    const credential = await issue();
    const { id } = writeCredentialRecord({
      dataDir,
      credential,
      source: "cli",
    });
    const v = verifier({ watch: false });
    expect((await v.check(claim())).ok).toBe(true);

    fs.rmSync(credentialRecordFile(dataDir, id));
    expect(await v.check(claim(), credential)).toEqual({
      ok: false,
      reason: "withdrawn-here",
    });
    expect(readCredentialWithdrawal({ dataDir, id })).toMatchObject({
      by: "host",
      credentialId: credential.id,
    });

    // A restart while Renown cannot be reached: the signature alone is not enough.
    expect(await verifier().check(claim(), credential)).toEqual({
      ok: false,
      reason: "withdrawn-here",
    });
  });

  it("hears a removed record without a request, so open sockets can close", async () => {
    const { id } = writeCredentialRecord({
      dataDir,
      credential: await issue(),
      source: "cli",
    });
    const v = verifier();
    expect((await v.check(claim())).ok).toBe(true);
    const heard = new Promise<CredentialClaim>((resolve) =>
      v.onWithdrawn(resolve),
    );
    fs.rmSync(credentialRecordFile(dataDir, id));
    expect((await heard).sessionDid).toBe(SESSION);
    await vi.waitFor(() =>
      expect(fs.existsSync(credentialWithdrawalFile(dataDir, id))).toBe(true),
    );
  });

  it("notes a record's last use beside it, at most hourly", async () => {
    const { id } = writeCredentialRecord({
      dataDir,
      credential: await issue(),
      source: "enrolled",
    });
    let clock = Date.now();
    const v = verifier({ watch: false, now: () => clock });
    expect((await v.check(claim())).ok).toBe(true);
    const first = new Date(clock).toISOString();
    expect(readCredentialRecordLastUsed({ dataDir, id })).toBe(first);
    clock += 30 * 60_000;
    expect((await v.check(claim())).ok).toBe(true);
    expect(readCredentialRecordLastUsed({ dataDir, id })).toBe(first);
    clock += 31 * 60_000;
    expect((await v.check(claim())).ok).toBe(true);
    expect(readCredentialRecordLastUsed({ dataDir, id })).toBe(
      new Date(clock).toISOString(),
    );
  });

  it("forgets an evicted record: its removal is no withdrawal", async () => {
    const credential = await issue();
    const { id } = writeCredentialRecord({
      dataDir,
      credential,
      source: "enrolled",
    });
    const v = verifier({ watch: false });
    expect((await v.check(claim())).ok).toBe(true);
    v.forgetRecord(claim());
    fs.rmSync(credentialRecordFile(dataDir, id));
    // Checked as a credential with no record: Renown is out of reach here.
    expect(await v.check(claim(), credential)).toMatchObject({
      ok: true,
      via: "signature",
    });
    expect(readCredentialWithdrawal({ dataDir, id })).toBeUndefined();
  });

  it("reads a rewritten record again", async () => {
    writeCredentialRecord({
      dataDir,
      credential: await issue({ days: 1 }),
      source: "cli",
    });
    const v = verifier({ watch: false });
    const first = await v.check(claim());
    const renewed = await issue({ days: 30 });
    writeCredentialRecord({ dataDir, credential: renewed, source: "cli" });
    const second = await v.check(claim());
    expect(second).toMatchObject({ ok: true, credentialId: renewed.id });
    expect(first.ok && first.credentialId).not.toBe(renewed.id);
  });

  it("accepts a credential issued after a withdrawal", async () => {
    const { id } = writeCredentialRecord({
      dataDir,
      credential: await issue(),
      source: "cli",
    });
    withdrawCredentialRecords({
      dataDir,
      ids: [id],
      by: "command",
      now: new Date(Date.now() - 1000),
    });
    const v = verifier({ watch: false });
    expect((await v.check(claim())).ok).toBe(false);
    writeCredentialRecord({
      dataDir,
      credential: await issue(),
      source: "cli",
    });
    expect(await v.check(claim())).toMatchObject({ ok: true, via: "record" });
  });

  it("refuses a forged and an expired record", async () => {
    const forged = await issue({ account: stranger });
    writeCredentialRecord({
      dataDir,
      credential: {
        ...forged,
        issuer: {
          id: `did:pkh:eip155:1:${person.address.toLowerCase()}`,
          ethereumAddress: person.address,
        },
      },
      source: "cli",
    });
    expect(await verifier({ watch: false }).check(claim())).toEqual({
      ok: false,
      reason: "bad-credential",
    });

    const expired = await issue({ session: "did:key:zOld", days: -1 });
    writeCredentialRecord({ dataDir, credential: expired, source: "cli" });
    expect(
      await verifier({ watch: false }).check(
        claim({ sessionDid: "did:key:zOld" }),
      ),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts a pseudonym's labelled credential from its record", async () => {
    const identity = await resolveActiveIdentity({
      dataDir,
      interactive: false,
      create: true,
      env: { PH_IDENTITY_HOME: path.join(dataDir, "home") },
    });
    const credential = await identity!.issueSessionCredential!(SESSION, {
      label: "vetra agent",
      expiresInDays: 30,
    });
    writeCredentialRecord({ dataDir, credential, source: "cli" });
    expect(
      await verifier().check(claim({ address: identity!.address }), credential),
    ).toMatchObject({ ok: true, via: "record", label: "vetra agent" });
  });
});

describe("createCredentialVerifier: the carried credential", () => {
  it("refuses one for another key, address or chain", async () => {
    const credential = await issue();
    const v = verifier();
    for (const other of [
      claim({ sessionDid: "did:key:zOther" }),
      claim({ address: stranger.address }),
      claim({ chainId: 137 }),
      claim({ networkId: "other" }),
    ]) {
      expect(await v.check(other, credential)).toEqual({
        ok: false,
        reason: "bad-credential",
      });
    }
    expect(await checkCredentialFor(credential, claim())).toBe("ok");
  });

  it("rides in the bearer and comes back whole", async () => {
    const credential = await issue();
    const crypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const token = await crypto.getBearerToken(person.address, {
      expiresIn: 60,
      credential,
    });
    const verified = await verifyAuthBearerToken(token);
    expect(verified).not.toBe(false);
    const carried = carriedCredentialOf(
      verified as { payload: Record<string, unknown> },
    );
    expect(carried).toEqual(credential);
    expect(await verifyCredentialSignature(carried!)).toBe(true);
    expect(token.length).toBeLessThan(4_000);
  });

  it("is left out when it has no proof to check", async () => {
    const { proof: _proof, ...bare } = await issue();
    const crypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const token = await crypto.getBearerToken(person.address, {
      credential: bare as PowerhouseVerifiableCredential,
    });
    const verified = await verifyAuthBearerToken(token);
    expect(
      carriedCredentialOf(verified as { payload: Record<string, unknown> }),
    ).toBeUndefined();
  });
});

describe("createCredentialVerifier: Renown", () => {
  it("accepts what Renown registers, asks once per TTL and keeps the answer", async () => {
    const credential = await issue();
    fetchSpy.mockImplementation(reply(200, { credential }));
    const v = verifier();
    expect(await v.check(claim())).toMatchObject({ ok: true, via: "renown" });
    expect(await v.check(claim())).toMatchObject({ ok: true, via: "renown" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const kept = JSON.parse(
      fs.readFileSync(path.join(dataDir, ".ph", ".credentials.json"), "utf8"),
    ) as Record<string, PowerhouseVerifiableCredential>;
    expect(Object.values(kept).map((c) => c.id)).toEqual([credential.id]);
  });

  it("refuses what Renown does not hold, carried or not", async () => {
    fetchSpy.mockImplementation(reply(404, { error: "not found" }));
    const v = verifier();
    expect(await v.check(claim(), await issue())).toEqual({
      ok: false,
      reason: "not-registered",
    });
    expect(await v.check(claim())).toEqual({
      ok: false,
      reason: "not-registered",
    });
  });

  it("tells a credential never held from one withdrawn, over the switchboard", async () => {
    const rows: unknown[] = [];
    const v = verifier({
      inProcessRenown: () =>
        Promise.resolve(() => Promise.resolve({ renownCredentials: rows })),
    });
    expect(await v.check(claim())).toEqual({
      ok: false,
      reason: "not-registered",
    });
  });

  it("answers within its timeout when the switchboard hangs", async () => {
    fetchSpy.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    const v = verifier({
      switchboardUrl: "https://renown.test/graphql",
      timeoutMs: 200,
    });
    const started = Date.now();
    expect(await v.check(claim())).toEqual({
      ok: false,
      reason: "unverifiable",
    });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("asks an unreachable Renown once a minute for a credential with no record", async () => {
    const credential = await issue();
    fetchSpy.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    let clock = Date.now();
    const v = verifier({ timeoutMs: 200, now: () => clock });
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      expect(await v.check(claim(), credential)).toMatchObject({
        ok: true,
        via: "signature",
      });
      // Only the first check waits Renown's timeout.
      if (i > 0) expect(Date.now() - started).toBeLessThan(150);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // A minute on, Renown is back and asked again.
    clock += 61_000;
    fetchSpy.mockImplementation(reply(404, { error: "not found" }));
    expect(await v.check(claim(), credential)).toEqual({
      ok: false,
      reason: "not-registered",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("asks again at once after forget, outage or not", async () => {
    const credential = await issue();
    const v = verifier();
    expect((await v.check(claim(), credential)).ok).toBe(true);
    expect((await v.check(claim(), credential)).ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    v.forget(person.address);
    fetchSpy.mockImplementation(reply(200, { credential }));
    expect(await v.check(claim(), credential)).toMatchObject({
      ok: true,
      via: "renown",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("asks again at once after forget while Renown is still out of reach", async () => {
    const credential = await issue();
    const v = verifier();
    // Renown is down (every fetch fails): the signature, and the mark.
    expect(await v.check(claim(), credential)).toMatchObject({
      ok: true,
      via: "signature",
    });
    expect((await v.check(claim(), credential)).ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Forgotten: the next check asks again, though Renown is still down.
    v.forget(person.address);
    expect(await v.check(claim(), credential)).toMatchObject({
      ok: true,
      via: "signature",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Marked again by that miss: no ask within the minute.
    expect((await v.check(claim(), credential)).ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps Renown's last answer while it cannot be reached, across a restart", async () => {
    const credential = await issue();
    fetchSpy.mockImplementation(reply(200, { credential }));
    expect((await verifier({ answerTtlMs: 0 }).check(claim())).ok).toBe(true);

    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    expect(
      await verifier({ refuseUnseenOffline: true }).check(claim()),
    ).toMatchObject({
      ok: true,
      via: "last-answer",
    });
  });

  it("keeps a refusal while Renown cannot be reached", async () => {
    const credential = await issue();
    fetchSpy.mockImplementation(reply(404, { error: "not found" }));
    const v = verifier({ answerTtlMs: 0 });
    expect((await v.check(claim(), credential)).ok).toBe(false);
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    expect(await v.check(claim(), credential)).toEqual({
      ok: false,
      reason: "not-registered",
    });
  });

  it("accepts an unseen credential on its signature offline, unless told not to", async () => {
    const credential = await issue();
    expect(await verifier().check(claim(), credential)).toMatchObject({
      ok: true,
      via: "signature",
      label: "agent X",
    });
    expect(
      await verifier({ refuseUnseenOffline: true }).check(claim(), credential),
    ).toEqual({ ok: false, reason: "unverifiable" });
    expect(await verifier().check(claim())).toEqual({
      ok: false,
      reason: "unverifiable",
    });
  });

  it("refuses an expired credential, even as Renown's last answer", async () => {
    const credential = await issue({ days: -1 });
    expect(await verifier().check(claim(), credential)).toEqual({
      ok: false,
      reason: "expired",
    });
    fs.mkdirSync(path.join(dataDir, ".ph"), { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, ".ph", ".credentials.json"),
      JSON.stringify({
        [`${person.address.toLowerCase()}|1|${SESSION}`]: credential,
      }),
    );
    expect(await verifier().check(claim())).toEqual({
      ok: false,
      reason: "expired",
    });
  });
});

describe("createCredentialVerifier: a recorded credential Renown signed", () => {
  it("is refused, and withdrawn here, once Renown has not served it for a minute", async () => {
    const credential = await issue();
    const { id } = writeCredentialRecord({
      dataDir,
      credential,
      source: "host-session",
    });
    fetchSpy.mockImplementation(reply(200, { credential }));
    let clock = Date.now();
    const v = verifier({ answerTtlMs: 0, watch: false, now: () => clock });
    const heard: string[] = [];
    v.onWithdrawn((c) => heard.push(c.sessionDid));
    expect(await v.check(claim(), undefined, { atRenown: true })).toMatchObject(
      { ok: true, via: "record" },
    );
    // Withdrawn at Renown: REST serves active credentials only. One answer
    // saying so is not enough: the credential holds until a second one, a
    // minute or more after the first.
    fetchSpy.mockImplementation(reply(404, {}));
    for (const later of [0, 30_000, 29_000]) {
      clock += later;
      expect(
        await v.check(claim(), undefined, { atRenown: true }),
      ).toMatchObject({ ok: true, via: "record" });
    }
    expect(readCredentialWithdrawal({ dataDir, id })).toBeUndefined();
    expect(heard).toEqual([]);
    clock += 1_000;
    expect(await v.check(claim(), undefined, { atRenown: true })).toEqual({
      ok: false,
      reason: "withdrawn-at-renown",
    });
    expect(readCredentialWithdrawal({ dataDir, id })?.by).toBe("renown");
    expect(fs.existsSync(credentialRecordFile(dataDir, id))).toBe(false);
    expect(heard).toEqual([SESSION]);
    // From now on, and without Renown, it is withdrawn here.
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    expect(await v.check(claim())).toEqual({
      ok: false,
      reason: "withdrawn-here",
    });
  });

  it("asks Renown once per TTL, and keeps the record's answer while Renown cannot be reached", async () => {
    const credential = await issue();
    writeCredentialRecord({ dataDir, credential, source: "host-session" });
    fetchSpy.mockImplementation(reply(200, { credential }));
    const v = verifier();
    for (let i = 0; i < 3; i++) {
      expect((await v.check(claim(), undefined, { atRenown: true })).ok).toBe(
        true,
      );
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    expect(
      await verifier().check(claim(), undefined, { atRenown: true }),
    ).toMatchObject({ ok: true, via: "record" });
  });

  it("writes no tombstone for one empty answer: served again, the miss is forgotten", async () => {
    const credential = await issue();
    const { id } = writeCredentialRecord({
      dataDir,
      credential,
      source: "host-session",
    });
    let clock = Date.now();
    const v = verifier({ answerTtlMs: 0, watch: false, now: () => clock });
    const check = () => v.check(claim(), undefined, { atRenown: true });
    fetchSpy.mockImplementation(reply(200, { credential: null }));
    expect((await check()).ok).toBe(true);
    clock += 61_000;
    fetchSpy.mockImplementation(reply(200, { credential }));
    expect((await check()).ok).toBe(true);
    clock += 61_000;
    fetchSpy.mockImplementation(reply(200, { credential: null }));
    expect((await check()).ok).toBe(true);
    expect(readCredentialWithdrawal({ dataDir, id })).toBeUndefined();
    expect(fs.existsSync(credentialRecordFile(dataDir, id))).toBe(true);
  });

  it("asks an unreachable Renown once a minute, keeping the record's answer", async () => {
    const credential = await issue();
    writeCredentialRecord({ dataDir, credential, source: "host-session" });
    let clock = Date.now();
    const v = verifier({ answerTtlMs: 0, watch: false, now: () => clock });
    const check = () => v.check(claim(), undefined, { atRenown: true });
    for (let i = 0; i < 3; i++) {
      expect(await check()).toMatchObject({ ok: true, via: "record" });
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    clock += 61_000;
    expect((await check()).ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("counts a miss heard before an outage toward the second one", async () => {
    const credential = await issue();
    const { id } = writeCredentialRecord({
      dataDir,
      credential,
      source: "host-session",
    });
    let clock = Date.now();
    const v = verifier({ answerTtlMs: 0, watch: false, now: () => clock });
    const check = () => v.check(claim(), undefined, { atRenown: true });
    fetchSpy.mockImplementation(reply(404, {}));
    expect((await check()).ok).toBe(true);
    clock += 10_000;
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    expect((await check()).ok).toBe(true);
    clock += 61_000;
    fetchSpy.mockImplementation(reply(404, {}));
    expect(await check()).toEqual({
      ok: false,
      reason: "withdrawn-at-renown",
    });
    expect(readCredentialWithdrawal({ dataDir, id })?.by).toBe("renown");
  });

  it("is the record's alone without `atRenown`: a pseudonym's is never asked", async () => {
    writeCredentialRecord({
      dataDir,
      credential: await issue(),
      source: "host-session",
    });
    fetchSpy.mockImplementation(reply(404, {}));
    expect((await verifier().check(claim())).ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("credential record requests", () => {
  it("are signed by the address and bound to their chain", async () => {
    const request: CredentialRecordRequest = {
      action: "enrol",
      host: "did:key:zHost",
      nonce: "00ff",
      sessionDid: SESSION,
      credentialId: "urn:uuid:1",
    };
    const signature = await signCredentialRecordRequest(
      signAs(person),
      request,
      1,
    );
    expect(
      await recoverCredentialRecordRequestSigner(request, signature, 1),
    ).toBe(person.address);
    expect(
      await recoverCredentialRecordRequestSigner(request, signature, 137),
    ).not.toBe(person.address);
    expect(
      await recoverCredentialRecordRequestSigner(
        { ...request, host: "did:key:zElsewhere" },
        signature,
        1,
      ),
    ).not.toBe(person.address);
    expect(await recoverCredentialRecordRequestSigner(request, "0x00", 1)).toBe(
      undefined,
    );
    expect(CREDENTIAL_ROUTES.enrol).toBe("/credentials/enrol");
  });
});
