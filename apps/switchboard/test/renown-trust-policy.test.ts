import type {
  ActionSigner,
  ISigner,
} from "@powerhousedao/shared/document-model";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type SignatureTrustPolicy,
} from "@powerhousedao/reactor";
import type { IRenown } from "@renown/sdk/node";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applySwitchboardReactorDefaults } from "../src/builder-defaults.mjs";
import { getRenownTrustPolicyConfig } from "../src/renown.js";

const WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const CONNECT_KEY = "did:key:zDnaeConnectKey";
const SWITCHBOARD_KEY = "did:key:zDnaeSwitchboardKey";
const SWITCHBOARD_USER = {
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  networkId: "eip155",
  chainId: 1,
};
const GRAPHQL = "http://renown.test/graphql";

// Signed by WALLET's Anvil dev key; its expiry is ignored by the policy.
const CREDENTIAL_ROW = {
  documentId: "doc-cred",
  credentialId: "urn:uuid:c7882913-68ef-48e5-9e89-f2948d2ca22c",
  context: ["https://www.w3.org/2018/credentials/v1"],
  type: ["VerifiableCredential", "RenownCredential"],
  issuerId: "did:pkh:eip155:1:0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  issuerEthereumAddress: WALLET,
  issuanceDate: "2026-09-24T00:48:25.566Z",
  expirationDate: "2026-10-01T00:48:25.566Z",
  credentialSubjectId: CONNECT_KEY,
  credentialSubjectApp: "connect",
  credentialStatusId: null,
  credentialStatusType: null,
  credentialSchemaId: "https://renown.id/schemas/renown-credential/v1",
  credentialSchemaType: "JsonSchemaValidator2018",
  proofVerificationMethod:
    "did:pkh:eip155:1:0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  proofEthereumAddress: WALLET,
  proofCreated: "2026-09-24T00:48:25.566Z",
  proofPurpose: "assertionMethod",
  proofType: "EthereumEip712Signature2021",
  proofValue:
    "0xe8d7a2468b9eb21286483fd88601d350ac7a8ed908506e51a34c6b119f93a7d75c6284a3f231698f6fcc8a3ad0ec5096a34811c7b6adef2d1e4146ddb22826a91c",
  proofEip712Domain: JSON.stringify({ version: "1", chainId: 1 }),
  proofEip712PrimaryType: "VerifiableCredential",
  revoked: false,
};

function stubRenown(): IRenown {
  const signer = {
    user: SWITCHBOARD_USER,
    app: { name: "switchboard", key: SWITCHBOARD_KEY },
  } as unknown as ISigner;
  return { signer } as unknown as IRenown;
}

function claim(address: string, key: string): ActionSigner {
  return {
    user: { address, networkId: "eip155", chainId: 1 },
    app: { name: "connect", key },
    signatures: [],
  };
}

/** Answers the renown read model with `rows`; counts the requests. */
function mockReadModel(rows: unknown[] = [CREDENTIAL_ROW]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: { renownCredentials: rows } }), {
        status: 200,
      }),
    ),
  );
}

async function remotePolicy(): Promise<SignatureTrustPolicy> {
  const { trustPolicy } = await getRenownTrustPolicyConfig(
    { source: "remote", switchboardUrl: GRAPHQL },
    stubRenown(),
  );
  return trustPolicy!;
}

describe("getRenownTrustPolicyConfig", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts a key a credential binds to the claimed wallet", async () => {
    const fetchMock = mockReadModel();
    const policy = await remotePolicy();

    await expect(
      policy.authorizeSigner(claim(WALLET, CONNECT_KEY), CONNECT_KEY, "doc"),
    ).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(GRAPHQL);
  });

  it("refuses a mismatched address or key", async () => {
    mockReadModel();
    const policy = await remotePolicy();

    await expect(
      policy.authorizeSigner(
        claim(SWITCHBOARD_USER.address, CONNECT_KEY),
        CONNECT_KEY,
        "doc",
      ),
    ).resolves.toBe(false);
    await expect(
      policy.authorizeSigner(
        claim(WALLET, "did:key:zDnaeOther"),
        "did:key:zDnaeOther",
        "doc",
      ),
    ).resolves.toBe(false);
  });

  it("caches an acceptance per (address, key)", async () => {
    const fetchMock = mockReadModel();
    const policy = await remotePolicy();
    const signer = claim(WALLET, CONNECT_KEY);

    await policy.authorizeSigner(signer, CONNECT_KEY, "doc-1");
    fetchMock.mockRejectedValue(new TypeError("offline"));

    await expect(
      policy.authorizeSigner(signer, CONNECT_KEY, "doc-2"),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a network failure rather than refusing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const policy = await remotePolicy();

    await expect(
      policy.authorizeSigner(claim(WALLET, CONNECT_KEY), CONNECT_KEY, "doc"),
    ).rejects.toThrow("offline");
  });

  it("accepts the switchboard's own key for its own user without a lookup", async () => {
    const fetchMock = mockReadModel([]);
    const policy = await remotePolicy();

    await expect(
      policy.authorizeSigner(
        claim(SWITCHBOARD_USER.address, SWITCHBOARD_KEY),
        SWITCHBOARD_KEY,
        "doc",
      ),
    ).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives pooled workers a spec that builds the same policy", async () => {
    const fetchMock = mockReadModel();
    const { workerTrustPolicy } = await getRenownTrustPolicyConfig(
      { source: "remote", switchboardUrl: GRAPHQL },
      stubRenown(),
    );

    const module = workerTrustPolicy!.module;
    expect(module.exportName).toBe("createRenownTrustPolicy");
    const filePath = "filePath" in module ? module.filePath : "";
    expect(existsSync(filePath)).toBe(true);
    expect(workerTrustPolicy!.initArgs).toEqual({
      switchboard: GRAPHQL,
      self: { key: SWITCHBOARD_KEY, user: SWITCHBOARD_USER },
    });

    const imported = (await import(pathToFileURL(filePath).href)) as Record<
      string,
      (args: unknown) => SignatureTrustPolicy
    >;
    const policy = imported[module.exportName](workerTrustPolicy!.initArgs);
    await expect(
      policy.authorizeSigner(claim(WALLET, CONNECT_KEY), CONNECT_KEY, "doc"),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads a self source in process and gives workers no spec", async () => {
    const request = vi.fn(() =>
      Promise.resolve({ renownCredentials: [CREDENTIAL_ROW] }),
    );
    const config = await getRenownTrustPolicyConfig(
      { source: "self", request },
      null,
    );

    expect(config.workerTrustPolicy).toBeUndefined();
    await expect(
      config.trustPolicy!.authorizeSigner(
        claim(WALLET, CONNECT_KEY),
        CONNECT_KEY,
        "doc",
      ),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("applySwitchboardReactorDefaults with a trust policy", () => {
  it("gives the reactor the policy and its worker spec", () => {
    const reactorBuilder = new ReactorBuilder();
    const withTrustPolicy = vi.spyOn(reactorBuilder, "withTrustPolicy");
    const trustPolicy: SignatureTrustPolicy = {
      authorizeSigner: () => Promise.resolve(true),
    };
    const workerTrustPolicy = {
      module: { filePath: "/trust.js", exportName: "createTrustPolicy" },
    };

    applySwitchboardReactorDefaults(
      reactorBuilder,
      new ReactorClientBuilder(),
      {
        includeBaseModels: false,
        signalHandlers: false,
        trustPolicy: { trustPolicy, workerTrustPolicy },
      },
    );

    expect(withTrustPolicy).toHaveBeenCalledWith(
      trustPolicy,
      workerTrustPolicy,
    );
    expect(reactorBuilder.hasTrustPolicy()).toBe(true);
  });

  it("leaves the reactor on the default without one", () => {
    const reactorBuilder = new ReactorBuilder();

    applySwitchboardReactorDefaults(
      reactorBuilder,
      new ReactorClientBuilder(),
      {
        includeBaseModels: false,
        signalHandlers: false,
      },
    );

    expect(reactorBuilder.hasTrustPolicy()).toBe(false);
  });
});
