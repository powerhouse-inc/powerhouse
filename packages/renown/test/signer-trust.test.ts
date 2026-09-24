import type { ActionSigner } from "@powerhousedao/shared/document-model";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAndSignCredential,
  type SignCredentialTypedData,
} from "../src/credential.js";
import { createRenownTrustPolicy } from "../src/signer-trust.js";
import type { SwitchboardRequestFn } from "../src/switchboard.js";
import type { PowerhouseVerifiableCredential } from "../src/types.js";

// Well-known Anvil dev keys; never used for anything real.
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const other = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const APP_KEY = "did:key:zDnaeAppKey";
const OTHER_KEY = "did:key:zDnaeOtherKey";
const DOCUMENT_ID = "doc-1";

const signWith =
  (signer: typeof account): SignCredentialTypedData =>
  (args) =>
    signer.signTypedData(args as Parameters<typeof signer.signTypedData>[0]);

const credentialFor = (appId = APP_KEY, signer = account, expiresInDays = 7) =>
  buildAndSignCredential({
    signTypedData: signWith(signer),
    address: signer.address,
    chainId: 1,
    app: "connect",
    appId,
    expiresInDays,
  });

const row = (c: PowerhouseVerifiableCredential, revoked = false) => ({
  documentId: "doc-cred",
  credentialId: c.id,
  context: c["@context"],
  type: c.type,
  issuerId: c.issuer.id,
  issuerEthereumAddress: c.issuer.ethereumAddress,
  issuanceDate: c.issuanceDate,
  expirationDate: c.expirationDate,
  credentialSubjectId: c.credentialSubject.id,
  credentialSubjectApp: c.credentialSubject.app,
  credentialStatusId: null,
  credentialStatusType: null,
  credentialSchemaId: c.credentialSchema.id,
  credentialSchemaType: c.credentialSchema.type,
  proofVerificationMethod: c.proof.verificationMethod,
  proofEthereumAddress: c.proof.ethereumAddress,
  proofCreated: c.proof.created,
  proofPurpose: c.proof.proofPurpose,
  proofType: c.proof.type,
  proofValue: c.proof.proofValue,
  proofEip712Domain: JSON.stringify(c.proof.eip712.domain),
  proofEip712PrimaryType: c.proof.eip712.primaryType,
  revoked,
});

function signerAs(address: string, key = APP_KEY): ActionSigner {
  return {
    user: { address, networkId: "eip155", chainId: 1 },
    app: { name: "connect", key },
    signatures: [],
  };
}

/** A read-model transport answering with `rows`, counting its requests. */
function readModel(rows: unknown[]) {
  const request = vi.fn<SwitchboardRequestFn>(() =>
    Promise.resolve({ renownCredentials: rows }),
  );
  return request;
}

describe("createRenownTrustPolicy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts a key the address delegated to", async () => {
    const request = readModel([row(await credentialFor())]);
    const policy = createRenownTrustPolicy({ switchboard: request });

    await expect(
      policy.authorizeSigner(signerAs(account.address), APP_KEY, DOCUMENT_ID),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(expect.any(String), {
      input: expect.objectContaining({
        ethAddress: account.address.toLowerCase(),
        did: APP_KEY,
        includeRevoked: true,
      }) as unknown,
    });
  });

  it("accepts a credential that has since expired or been revoked", async () => {
    const expired = await credentialFor(APP_KEY, account, -1);
    const policy = createRenownTrustPolicy({
      switchboard: readModel([row(expired, true)]),
    });

    await expect(
      policy.authorizeSigner(signerAs(account.address), APP_KEY, DOCUMENT_ID),
    ).resolves.toBe(true);
  });

  it("refuses a claimed address the credential was not issued by", async () => {
    const policy = createRenownTrustPolicy({
      switchboard: readModel([row(await credentialFor())]),
    });

    await expect(
      policy.authorizeSigner(signerAs(other.address), APP_KEY, DOCUMENT_ID),
    ).resolves.toBe(false);
  });

  it("refuses a key the credential does not delegate to", async () => {
    const policy = createRenownTrustPolicy({
      switchboard: readModel([row(await credentialFor())]),
    });

    await expect(
      policy.authorizeSigner(
        signerAs(account.address, OTHER_KEY),
        OTHER_KEY,
        DOCUMENT_ID,
      ),
    ).resolves.toBe(false);
  });

  it("refuses a credential whose proof another wallet signed", async () => {
    const genuine = await credentialFor();
    const forgedBy = await credentialFor(APP_KEY, other);
    const forged = {
      ...genuine,
      proof: { ...genuine.proof, proofValue: forgedBy.proof.proofValue },
    };
    const policy = createRenownTrustPolicy({
      switchboard: readModel([row(forged)]),
    });

    await expect(
      policy.authorizeSigner(signerAs(account.address), APP_KEY, DOCUMENT_ID),
    ).resolves.toBe(false);
  });

  it("refuses without a lookup when the claim cannot name a credential", async () => {
    const request = readModel([]);
    const policy = createRenownTrustPolicy({ switchboard: request });

    await expect(
      policy.authorizeSigner(signerAs(""), APP_KEY, DOCUMENT_ID),
    ).resolves.toBe(false);
    await expect(
      policy.authorizeSigner(
        signerAs(account.address, "0xnot-a-did"),
        "0xnot-a-did",
        DOCUMENT_ID,
      ),
    ).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("caches an acceptance per (address, key), and never re-asks", async () => {
    const request = readModel([row(await credentialFor())]);
    const policy = createRenownTrustPolicy({ switchboard: request });
    const signer = signerAs(account.address);

    const concurrent = await Promise.all([
      policy.authorizeSigner(signer, APP_KEY, DOCUMENT_ID),
      policy.authorizeSigner(signer, APP_KEY, "doc-2"),
    ]);
    request.mockResolvedValue({ renownCredentials: [] });
    const later = await policy.authorizeSigner(signer, APP_KEY, "doc-3");

    expect(concurrent).toEqual([true, true]);
    expect(later).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);

    await policy.authorizeSigner(
      signerAs(account.address, OTHER_KEY),
      OTHER_KEY,
      DOCUMENT_ID,
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("asks again about a refusal once it is stale", async () => {
    const request = readModel([]);
    const policy = createRenownTrustPolicy({
      switchboard: request,
      refusalTtlMs: 0,
    });
    const signer = signerAs(account.address);

    expect(await policy.authorizeSigner(signer, APP_KEY, DOCUMENT_ID)).toBe(
      false,
    );
    request.mockResolvedValue({
      renownCredentials: [row(await credentialFor())],
    });

    expect(await policy.authorizeSigner(signer, APP_KEY, DOCUMENT_ID)).toBe(
      true,
    );
  });

  it("throws on a failed lookup, and asks again next time", async () => {
    const request = vi
      .fn<SwitchboardRequestFn>()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue({ renownCredentials: [row(await credentialFor())] });
    const policy = createRenownTrustPolicy({ switchboard: request });
    const signer = signerAs(account.address);

    await expect(
      policy.authorizeSigner(signer, APP_KEY, DOCUMENT_ID),
    ).rejects.toThrow("fetch failed");
    await expect(
      policy.authorizeSigner(signer, APP_KEY, DOCUMENT_ID),
    ).resolves.toBe(true);
  });

  it("throws when the switchboard endpoint is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const policy = createRenownTrustPolicy({
      switchboard: "http://renown.test/graphql",
    });

    await expect(
      policy.authorizeSigner(signerAs(account.address), APP_KEY, DOCUMENT_ID),
    ).rejects.toThrow("offline");
  });

  it("reads Renown's REST API without a switchboard, throwing on a server error", async () => {
    const credential = await credentialFor();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ credential }), { status: 200 }),
      );
    const policy = createRenownTrustPolicy({ renownUrl: "http://renown.test" });
    const signer = signerAs(account.address);

    await expect(
      policy.authorizeSigner(signer, APP_KEY, DOCUMENT_ID),
    ).rejects.toThrow("503");
    await expect(
      policy.authorizeSigner(signer, APP_KEY, DOCUMENT_ID),
    ).resolves.toBe(true);
    expect((fetchMock.mock.calls[1][0] as URL).href).toContain(
      "http://renown.test/api/auth/credential?",
    );
  });

  it("accepts its own key for its own user without a lookup", async () => {
    const request = readModel([]);
    const self = {
      key: "did:key:zDnaeSwitchboard",
      user: { address: account.address, networkId: "eip155", chainId: 1 },
    };
    const policy = createRenownTrustPolicy({ switchboard: request, self });

    await expect(
      policy.authorizeSigner(
        signerAs(account.address, self.key),
        self.key,
        DOCUMENT_ID,
      ),
    ).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();

    await expect(
      policy.authorizeSigner(
        signerAs(other.address, self.key),
        self.key,
        DOCUMENT_ID,
      ),
    ).resolves.toBe(false);
  });
});
