// A delegate signing publishes as a person, over a real reactor with real
// keys and credentials, and everything around it (ADR 0008). The host has no
// address, as a container with no `ph login` has none.
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
  type InProcessReactorClientModule,
  type SignatureTrustPolicy,
  type SignerConfig,
} from "@powerhousedao/reactor";
import { publishRunUser } from "@powerhousedao/reactor-workflow";
import {
  deserializeSignature,
  serializeSignature,
  type Action,
  type DocumentModelModule,
  type Operation,
} from "@powerhousedao/shared/document-model";
import {
  Workflow,
  actions as workflowActions,
} from "@powerhousedao/workflow/document-models/workflow";
import {
  buildAndSignCredential,
  createDelegation,
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
  signDelegatedAction,
  type IRenown,
  type IRenownCrypto,
  type PowerhouseVerifiableCredential,
  type SignCredentialTypedData,
} from "@renown/sdk/node";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getDelegationTrustPolicyConfig,
  getRenownTrustPolicyConfig,
} from "../src/renown.js";

// viem is the SDK's own dependency; the switchboard does not declare it.
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
const USER = { address: PERSON.address, networkId: "eip155", chainId: 1 };
const SCOPE = { ops: ["PUBLISH_WORKFLOW"], res: "sektar/integration:i-1" };

const newCrypto = (): Promise<IRenownCrypto> =>
  new RenownCryptoBuilder().withKeyPairStorage(new MemoryKeyStorage()).build();

const publish = () =>
  workflowActions.publishWorkflow({ publishedAt: new Date().toISOString() });

type Trust = Pick<SignerConfig, "trustPolicy" | "workerTrustPolicy">;

async function reactorOf(
  hostSigner: RenownCryptoSigner,
  trust: Trust,
  featureFlags = {},
): Promise<InProcessReactorClientModule> {
  return new ReactorClientBuilder()
    .withSigner(hostSigner)
    .withCreateSignaturePolicy("v2-required")
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([Workflow as unknown as DocumentModelModule])
        .withExecutorConfig({ featureFlags })
        .withTrustPolicy(trust.trustPolicy as SignatureTrustPolicy),
    )
    .buildModule();
}

async function clientOver(
  over: InProcessReactorClientModule,
  signer?: RenownCryptoSigner,
): Promise<IReactorClient> {
  const builder = new ReactorClientBuilder().withReactor(
    over.reactor,
    over.eventBus,
    over.documentIndexer,
    over.documentView,
  );
  return (signer ? builder.withSigner(signer) : builder).build();
}

describe("delegated publishes", () => {
  let session: IRenownCrypto;
  let delegate: IRenownCrypto;
  let hostCrypto: IRenownCrypto;
  let hostSigner: RenownCryptoSigner;
  let credential: PowerhouseVerifiableCredential;
  let statement: string;
  let module: InProcessReactorClientModule;

  const statementFor = (
    overrides: Partial<Parameters<typeof createDelegation>[0]> = {},
  ) =>
    createDelegation({
      issuer: session.issuer,
      credential,
      delegate: delegate.did,
      environment: hostCrypto.did,
      scope: SCOPE,
      ...overrides,
    });

  const signed = (
    action: Action,
    documentId: string,
    by: { crypto?: IRenownCrypto; statement?: string } = {},
  ) =>
    signDelegatedAction({
      action,
      target: { documentId, branch: "main" },
      crypto: by.crypto ?? delegate,
      appName: "sektar-runner",
      user: USER,
      statement: by.statement ?? statement,
    });

  const newWorkflow = async (
    over: InProcessReactorClientModule = module,
  ): Promise<string> => {
    const created = await over.client.create(Workflow.utils.createDocument());
    return created.header.id;
  };

  const submit = async (id: string, actions: Action[]) => {
    const job = await module.reactor.execute(id, "main", actions);
    return module.client.waitForJob(job);
  };

  const hostIdentity = () => ({ key: hostCrypto.did });

  const publishes = async (id: string): Promise<Operation[]> => {
    const page = await module.client.getOperations(
      id,
      { scopes: ["global"] },
      { actionTypes: ["PUBLISH_WORKFLOW"] },
    );
    return page.results;
  };

  beforeAll(async () => {
    session = await newCrypto();
    delegate = await newCrypto();
    hostCrypto = await newCrypto();
    hostSigner = new RenownCryptoSigner(hostCrypto, "switchboard");
    credential = await buildAndSignCredential({
      signTypedData: ((args) =>
        PERSON.signTypedData(args)) as SignCredentialTypedData,
      address: PERSON.address,
      chainId: 1,
      app: "connect",
      appId: session.did,
    });
    statement = await statementFor();
    module = await reactorOf(
      hostSigner,
      getDelegationTrustPolicyConfig({
        signer: hostSigner,
      } as unknown as IRenown),
    );
  }, 60_000);

  afterAll(() => {
    module.reactor.kill();
  });

  describe("with authEnforcement off", () => {
    it("makes the person the run user of a publish the delegate signed", async () => {
      const id = await newWorkflow();
      const job = await submit(id, [await signed(publish(), id)]);
      expect(job.status).not.toBe("FAILED");

      const runUser = await publishRunUser(module.client, id, hostIdentity());
      expect(runUser?.address).toBe(PERSON.address);
      expect(runUser?.subject.key).toBe(delegate.did);
    });

    it("keeps the statement on the stored operation", async () => {
      const id = await newWorkflow();
      await submit(id, [await signed(publish(), id)]);
      const [operation] = await publishes(id);
      const signatures = operation.action.context!.signer!.signatures;
      expect(signatures).toHaveLength(2);
      expect(signatures[0][3]).toBe(statement);
    });

    it("takes a batch mixing the host's actions and a delegate's", async () => {
      const id = await newWorkflow();
      const client = await clientOver(module, hostSigner);
      await client.execute(id, "main", [
        workflowActions.setWorkflowName({ name: "Mixed" }),
        await signed(publish(), id),
        workflowActions.setWorkflowStatus({ status: "DISABLED" }),
      ]);

      const page = await module.client.getOperations(id, {
        scopes: ["global"],
      });
      const keys = page.results.map(
        (operation) => operation.action.context?.signer?.app.key,
      );
      expect(keys).toEqual([hostCrypto.did, delegate.did, hostCrypto.did]);
      const runUser = await publishRunUser(module.client, id, hostIdentity());
      expect(runUser?.address).toBe(PERSON.address);
    });

    it("refuses a stolen statement used by another key", async () => {
      const id = await newWorkflow();
      const thief = await newCrypto();
      const job = await submit(id, [
        await signed(publish(), id, { crypto: thief }),
      ]);
      expect(job.status).toBe("FAILED");
      expect(JSON.stringify(job.error)).toMatch(/SIGNER_UNAUTHORIZED/);
      expect(await publishes(id)).toEqual([]);
    });

    it("refuses a statement for another environment at first write", async () => {
      const id = await newWorkflow();
      const elsewhere = await newCrypto();
      const job = await submit(id, [
        await signed(publish(), id, {
          statement: await statementFor({ environment: elsewhere.did }),
        }),
      ]);
      expect(job.status).toBe("FAILED");
      expect(JSON.stringify(job.error)).toMatch(/SIGNER_UNAUTHORIZED/);
    });

    it("refuses a delegate signing outside its scope", async () => {
      const id = await newWorkflow();
      const job = await submit(id, [
        await signed(
          workflowActions.setWorkflowStatus({ status: "ENABLED" }),
          id,
        ),
      ]);
      expect(job.status).toBe("FAILED");
      expect(JSON.stringify(job.error)).toMatch(/SIGNER_UNAUTHORIZED/);
    });

    it("refuses an unsigned caller claiming a delegate", async () => {
      const id = await newWorkflow();
      const action = await signed(publish(), id);
      const claimed: Action = {
        ...action,
        context: {
          signer: {
            user: USER,
            app: { name: "sektar-runner", key: "" },
            signatures: [],
          },
        },
      };
      const job = await submit(id, [claimed]);
      expect(job.status).toBe("FAILED");
      // A v2-required document refuses it before the claim is even read.
      expect(JSON.stringify(job.error)).toMatch(/UNSIGNED_REQUIRED/);
    });

    it("refuses a claim of the delegate's key with no valid signature", async () => {
      const id = await newWorkflow();
      const action = await signed(publish(), id);
      const signer = action.context!.signer!;
      const tuple = signer.signatures.at(-1)!;
      const forged: Action = {
        ...action,
        context: {
          signer: {
            ...signer,
            signatures: [
              signer.signatures[0],
              [tuple[0], tuple[1], tuple[2], tuple[3], `0x${"ab".repeat(64)}`],
            ],
          },
        },
      };
      const job = await submit(id, [forged]);
      expect(job.status).toBe("FAILED");
      expect(JSON.stringify(job.error)).toMatch(/BAD_SIGNATURE/);
    });

    it("stores a replayed operation once", async () => {
      const id = await newWorkflow();
      const action = await signed(publish(), id);
      await submit(id, [action]);
      await submit(id, [action]);
      expect(await publishes(id)).toHaveLength(1);
    });
  });

  describe("a host with no delegations", () => {
    it("signs a publish itself, which has no run user", async () => {
      const id = await newWorkflow();
      const client = await clientOver(module, hostSigner);
      await client.execute(id, "main", [publish()]);
      expect(
        await publishRunUser(module.client, id, hostIdentity()),
      ).toBeNull();
    });

    it("still accepts a signed write with no statement, as the default did", async () => {
      const id = await newWorkflow();
      const someone = new RenownCryptoSigner(await newCrypto(), "app", USER);
      const client = await clientOver(module, someone);
      await client.execute(id, "main", [publish()]);
      const runUser = await publishRunUser(module.client, id, hostIdentity());
      expect(runUser?.address).toBe(PERSON.address);
    });

    it("asks nothing of Renown", () => {
      const trust = getDelegationTrustPolicyConfig({
        signer: hostSigner,
      } as unknown as IRenown);
      expect(trust.workerTrustPolicy?.initArgs).toMatchObject({
        delegationOnly: true,
      });
    });
  });

  describe("on load", () => {
    it("takes a delegated operation from a peer, across the wire format", async () => {
      const id = await newWorkflow();
      await submit(id, [await signed(publish(), id)]);

      // Another host: its environment is not the statement's.
      const peerCrypto = await newCrypto();
      const peerSigner = new RenownCryptoSigner(peerCrypto, "switchboard");
      const peer = await reactorOf(
        peerSigner,
        getDelegationTrustPolicyConfig({
          signer: peerSigner,
        } as unknown as IRenown),
      );
      try {
        for (const scope of ["document", "global"]) {
          const page = await module.client.getOperations(id, {
            scopes: [scope],
          });
          const overTheWire = page.results.map((operation) => {
            const signer = operation.action.context?.signer;
            if (!signer) return operation;
            return {
              ...operation,
              action: {
                ...operation.action,
                context: {
                  ...operation.action.context,
                  signer: {
                    ...signer,
                    signatures: signer.signatures
                      .map((tuple) => serializeSignature(tuple))
                      .map((wire) => deserializeSignature(wire)),
                  },
                },
              },
            };
          });
          const job = await peer.reactor.load(id, "main", overTheWire);
          const done = await peer.client.waitForJob(job);
          expect(done.status).not.toBe("FAILED");
        }
        const runUser = await publishRunUser(peer.client, id, {
          key: peerCrypto.did,
        });
        expect(runUser?.address).toBe(PERSON.address);
        expect(runUser?.subject.key).toBe(delegate.did);
      } finally {
        peer.reactor.kill();
      }
    });
  });

  describe("with authEnforcement on", () => {
    let enforcing: InProcessReactorClientModule;

    const submitted = async (id: string, action: Action) => {
      const job = await enforcing.reactor.execute(id, "main", [action]);
      return enforcing.client.waitForJob(job);
    };

    beforeAll(async () => {
      const trust = await getRenownTrustPolicyConfig(
        {
          source: "self",
          // Renown knows of no credential for the delegate, and is not asked.
          request: () => Promise.resolve({ renownCredentials: [] }),
        },
        { signer: hostSigner } as unknown as IRenown,
      );
      enforcing = await reactorOf(hostSigner, trust, {
        documentDecisions: true,
        authEnforcement: true,
      });
    }, 60_000);

    afterAll(() => {
      enforcing.reactor.kill();
    });

    it("accepts a valid chain, and refuses it with the statement stripped", async () => {
      const id = await newWorkflow(enforcing);
      const action = await signed(publish(), id);
      expect((await submitted(id, action)).status).not.toBe("FAILED");

      const again = await signed(publish(), id);
      const signer = again.context!.signer!;
      const stripped: Action = {
        ...again,
        context: {
          signer: { ...signer, signatures: signer.signatures.slice(-1) },
        },
      };
      const job = await submitted(id, stripped);
      expect(job.status).toBe("FAILED");
      expect(JSON.stringify(job.error)).toMatch(/SIGNER_UNAUTHORIZED/);
    });
  });
});
