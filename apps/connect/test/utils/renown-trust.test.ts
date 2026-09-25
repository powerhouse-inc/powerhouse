import type { SignatureTrustPolicy } from "@powerhousedao/reactor";
import {
  ReactorClientBuilder,
  type ReactorFeatureFlags,
  type SignerConfig,
} from "@powerhousedao/reactor-browser";
import type {
  ActionSigner,
  ISigner,
} from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import { MemoryKeyStorage, RenownCryptoBuilder } from "@renown/sdk/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerSignerConfig } from "../../src/reactor-worker-signer.js";
import { createBrowserReactor } from "../../src/utils/reactor.js";
import { MISSING_RENOWN_ENDPOINT_MESSAGE } from "../../src/utils/renown-trust.js";

vi.mock("../../src/pglite.db.js", () => ({
  getReactorPGlite: () => Promise.resolve({}),
}));

const WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOUND_KEY = "did:key:zDnaeConnectKey";
const UNBOUND_KEY = "did:key:zDnaeUnboundKey";
const GRAPHQL = "http://renown.test/graphql";
const ENFORCING: Partial<ReactorFeatureFlags> = {
  documentDecisions: true,
  authEnforcement: true,
};

// Signed by WALLET's Anvil dev key for BOUND_KEY; its expiry is ignored.
const CREDENTIAL_ROW = {
  documentId: "doc-cred",
  credentialId: "urn:uuid:c7882913-68ef-48e5-9e89-f2948d2ca22c",
  context: ["https://www.w3.org/2018/credentials/v1"],
  type: ["VerifiableCredential", "RenownCredential"],
  issuerId: "did:pkh:eip155:1:0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  issuerEthereumAddress: WALLET,
  issuanceDate: "2026-09-24T00:48:25.566Z",
  expirationDate: "2026-10-01T00:48:25.566Z",
  credentialSubjectId: BOUND_KEY,
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

function claim(address: string, key: string): ActionSigner {
  return {
    user: { address, networkId: "eip155", chainId: 1 },
    app: { name: "connect", key },
    signatures: [],
  };
}

/** Answers the renown read model with the credential for BOUND_KEY only. */
function mockReadModel() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
    const body = JSON.parse(init?.body as string) as {
      variables: { input: { did: string } };
    };
    const rows = body.variables.input.did === BOUND_KEY ? [CREDENTIAL_ROW] : [];
    return Promise.resolve(
      new Response(JSON.stringify({ data: { renownCredentials: rows } }), {
        status: 200,
      }),
    );
  });
}

async function expectBindsOnlyTheCredentialKey(policy: SignatureTrustPolicy) {
  await expect(
    policy.authorizeSigner(claim(WALLET, BOUND_KEY), BOUND_KEY, "doc"),
  ).resolves.toBe(true);
  await expect(
    policy.authorizeSigner(claim(WALLET, UNBOUND_KEY), UNBOUND_KEY, "doc"),
  ).resolves.toBe(false);
}

describe("main-thread reactor host", () => {
  afterEach(() => vi.restoreAllMocks());

  function stubRenown(): IRenown {
    const signer = {
      app: { name: "connect", key: "did:key:zDnaeTabKey" },
      user: undefined,
    } as unknown as ISigner;
    return { signer, user: undefined } as unknown as IRenown;
  }

  /** Builds the host with buildModule stubbed; returns what withSigner got. */
  async function signerConfigFor(
    featureFlags: Partial<ReactorFeatureFlags>,
    endpoints?: { renownUrl?: string; switchboardUrl?: string },
  ): Promise<SignerConfig> {
    const withSigner = vi.spyOn(ReactorClientBuilder.prototype, "withSigner");
    vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockResolvedValue(
      {} as Awaited<ReturnType<ReactorClientBuilder["buildModule"]>>,
    );
    await createBrowserReactor(
      [],
      [],
      stubRenown(),
      featureFlags,
      undefined,
      undefined,
      endpoints,
    );
    expect(withSigner).toHaveBeenCalledTimes(1);
    return withSigner.mock.calls[0][0] as SignerConfig;
  }

  it("installs a Renown trust policy under authEnforcement", async () => {
    const fetchMock = mockReadModel();
    const config = await signerConfigFor(ENFORCING, {
      switchboardUrl: GRAPHQL,
    });

    expect(config.trustPolicy).toBeDefined();
    await expectBindsOnlyTheCredentialKey(config.trustPolicy!);
    expect(fetchMock.mock.calls[0][0]).toBe(GRAPHQL);
  });

  it("installs no policy with authEnforcement off", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const config = await signerConfigFor(
      { documentDecisions: true },
      { switchboardUrl: GRAPHQL },
    );

    expect(config.trustPolicy).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails construction under authEnforcement with no Renown endpoint", async () => {
    vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockResolvedValue(
      {} as Awaited<ReturnType<ReactorClientBuilder["buildModule"]>>,
    );

    await expect(
      createBrowserReactor(
        [],
        [],
        stubRenown(),
        ENFORCING,
        undefined,
        undefined,
        {
          renownUrl: "",
        },
      ),
    ).rejects.toThrow(MISSING_RENOWN_ENDPOINT_MESSAGE);
  });
});

describe("SharedWorker reactor host", () => {
  afterEach(() => vi.restoreAllMocks());

  const crypto = () =>
    new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();

  it("installs a Renown trust policy under authEnforcement", async () => {
    mockReadModel();
    const { signerConfig } = await createWorkerSignerConfig(
      await crypto(),
      {
        featureFlags: ENFORCING,
        renownEndpoints: { switchboardUrl: GRAPHQL },
      },
      undefined,
    );

    expect(signerConfig.trustPolicy).toBeDefined();
    await expectBindsOnlyTheCredentialKey(signerConfig.trustPolicy!);
  });

  it("accepts its own key as the user it is updated to, without a lookup", async () => {
    const fetchMock = mockReadModel();
    const { signer, signerConfig } = await createWorkerSignerConfig(
      await crypto(),
      {
        featureFlags: ENFORCING,
        renownEndpoints: { switchboardUrl: GRAPHQL },
      },
      undefined,
    );
    signer.user = { address: OTHER_WALLET, networkId: "eip155", chainId: 1 };

    await expect(
      signerConfig.trustPolicy!.authorizeSigner(
        claim(OTHER_WALLET, signer.app.key),
        signer.app.key,
        "doc",
      ),
    ).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("installs no policy with authEnforcement off", async () => {
    const { signerConfig } = await createWorkerSignerConfig(
      await crypto(),
      { featureFlags: {}, renownEndpoints: { switchboardUrl: GRAPHQL } },
      undefined,
    );

    expect(signerConfig.trustPolicy).toBeUndefined();
  });

  it("fails the boot under authEnforcement when the tab sent no endpoint", async () => {
    await expect(
      createWorkerSignerConfig(
        await crypto(),
        { featureFlags: ENFORCING },
        undefined,
      ),
    ).rejects.toThrow(MISSING_RENOWN_ENDPOINT_MESSAGE);
  });
});
