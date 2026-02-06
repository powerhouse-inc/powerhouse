import {
  ReactorBuilder,
  ReactorClientBuilder,
  type ReactorClientModule,
} from "@powerhousedao/reactor";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
  signAction,
} from "@renown/sdk";
import { driveDocumentModelModule } from "document-drive";
import {
  documentModelDocumentModelModule,
  type UserActionSigner,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as resolvers from "../src/graphql/reactor/resolvers.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import type { DocumentPermissionService } from "../src/services/document-permission.service.js";

/**
 * Integration tests for signed action submission through the ReactorSubgraph.
 *
 * These tests verify that operations with signer context (user/app signatures)
 * are correctly accepted by mutateDocument and preserved when queried back.
 */
describe("Signed Action Submission through ReactorSubgraph", () => {
  let module: ReactorClientModule;
  let reactorSubgraph: ReactorSubgraph;
  let mockDocumentPermissionService: Partial<DocumentPermissionService>;
  let defaultSigner: RenownCryptoSigner;

  const createSigner = async (
    {
      app,
      user,
    }: {
      app: string;
      user?: UserActionSigner;
    } = { app: "test-app" },
  ) => {
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const renownSigner = new RenownCryptoSigner(renownCrypto, app, user);
    return renownSigner;
  };

  // Helper to create context with admin access (bypass permission checks)
  const createAdminContext = (): Context =>
    ({
      user: { address: "0xadmin" },
      isAdmin: () => true,
      isUser: () => false,
      isGuest: () => false,
    }) as unknown as Context;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock DocumentPermissionService
    mockDocumentPermissionService = {
      canReadDocument: vi.fn().mockResolvedValue(true),
      canWriteDocument: vi.fn().mockResolvedValue(true),
      canRead: vi.fn().mockResolvedValue(true),
      canWrite: vi.fn().mockResolvedValue(true),
      isOperationRestricted: vi.fn().mockResolvedValue(false),
      canExecuteOperation: vi.fn().mockResolvedValue(true),
    };

    // Create default signer for the reactor client
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    defaultSigner = new RenownCryptoSigner(renownCrypto, "test-app", {
      address: "0x1234567890abcdef1234567890abcdef12345678",
      networkId: "eip155",
      chainId: 1,
    });

    // Build reactor and client with signer
    const reactorBuilder = new ReactorBuilder().withDocumentModels([
      driveDocumentModelModule,
      documentModelDocumentModelModule,
    ]);
    module = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .withSignatureVerifier(RenownCryptoSigner.signatureVerifier)
      .buildModule();

    // Create ReactorSubgraph
    reactorSubgraph = new ReactorSubgraph({
      reactorClient: module.client,
      documentPermissionService:
        mockDocumentPermissionService as DocumentPermissionService,
      reactor: {} as SubgraphArgs["reactor"],
      relationalDb: {} as SubgraphArgs["relationalDb"],
      analyticsStore: {} as SubgraphArgs["analyticsStore"],
      graphqlManager: {} as SubgraphArgs["graphqlManager"],
      syncManager: {} as SubgraphArgs["syncManager"],
    } as SubgraphArgs);
  });

  afterEach(() => {
    module.reactor.kill();
  });

  // Helper to create a test document
  const createTestDocument = () => {
    return documentModelDocumentModelModule.utils.createDocument();
  };

  describe("mutateDocument with signed actions", () => {
    const callMutateDocument = async (
      ctx: Context,
      documentIdentifier: string,
      actions: unknown[],
    ) => {
      const mutation = reactorSubgraph.resolvers.Mutation!
        .mutateDocument! as unknown as (
        parent: unknown,
        args: {
          documentIdentifier: string;
          actions: unknown[];
          view?: {
            branch?: string | null;
            scopes?: readonly string[] | null;
          } | null;
        },
        ctx: Context,
      ) => Promise<unknown>;

      return mutation(
        null,
        {
          documentIdentifier,
          actions,
        },
        ctx,
      );
    };

    it("should accept actions without signer context (unsigned)", async () => {
      const ctx = createAdminContext();
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const action = documentModelDocumentModelModule.actions.setModelName({
        name: "Unsigned Document",
      });

      const result = await callMutateDocument(ctx, testDoc.header.id, [action]);
      expect(result).toBeDefined();

      const operationsResult = await resolvers.documentOperations(
        module.client,
        {
          filter: {
            documentId: testDoc.header.id,
            branch: null,
            scopes: null,
            actionTypes: null,
            sinceRevision: null,
            timestampFrom: null,
            timestampTo: null,
          },
          paging: null,
        },
      );
      const operation = operationsResult.items.find(
        (item) => item.action.id === action.id,
      );
      expect(operation).toBeDefined();
      expect(operation?.action.context?.signer).toStrictEqual({
        user: null,
        app: {},
      });
    });

    it("should accept actions with user signer context", async () => {
      const ctx = createAdminContext();
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const signer = await createSigner({
        user: {
          address: "0x1234567890abcdef1234567890abcdef12345678",
          networkId: "eip155",
          chainId: 1,
        },
      });

      const baseAction = documentModelDocumentModelModule.actions.setModelName({
        name: "Signed Document",
      });
      const signedAction = await signAction(baseAction, signer);

      const result = await callMutateDocument(ctx, testDoc.header.id, [
        signedAction,
      ]);

      expect(result).toBeDefined();
    });

    it("should accept actions with app signer context", async () => {
      const ctx = createAdminContext();
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const signer = await createSigner({
        app: "TestApp",
        user: undefined,
      });

      const baseAction = documentModelDocumentModelModule.actions.setModelName({
        name: "App Signed Document",
      });
      const signedAction = await signAction(baseAction, signer);

      const result = await callMutateDocument(ctx, testDoc.header.id, [
        signedAction,
      ]);

      expect(result).toBeDefined();
    });

    it("should accept actions with both user and app signer context", async () => {
      const ctx = createAdminContext();
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const signer = await createSigner({
        app: "PowerhouseApp",
        user: {
          address: "0xabcdef1234567890abcdef1234567890abcdef12",
          networkId: "eip155",
          chainId: 137,
        },
      });

      const baseAction = documentModelDocumentModelModule.actions.setModelName({
        name: "Dual Signed Document",
      });
      const signedAction = await signAction(baseAction, signer);

      const result = await callMutateDocument(ctx, testDoc.header.id, [
        signedAction,
      ]);

      expect(result).toBeDefined();
    });

    it("should accept multiple actions with different signer contexts", async () => {
      const ctx = createAdminContext();
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const user1Address = "0xuser1000000000000000000000000000000000001";
      const user2Address = "0xuser2000000000000000000000000000000000002";

      const signer1 = await createSigner({
        app: "app1",
        user: {
          address: user1Address,
          networkId: "eip1551",
          chainId: 2,
        },
      });

      const signer2 = await createSigner({
        app: "app2",
        user: {
          address: user2Address,
          networkId: "eip1552",
          chainId: 3,
        },
      });

      const action1 = await signAction(
        documentModelDocumentModelModule.actions.setModelName({
          name: "First Action",
        }),
        signer1,
      );

      const action2 = await signAction(
        documentModelDocumentModelModule.actions.setModelDescription({
          description: "Second Action Description",
        }),
        signer2,
      );

      // Store original signatures before submission
      const originalSigner1 = action1.context?.signer;
      const originalSigner2 = action2.context?.signer;

      const result = await callMutateDocument(ctx, testDoc.header.id, [
        action1,
        action2,
      ]);

      expect(result).toBeDefined();

      // Query the operations to check signatures match the originals
      const operationsResult = await resolvers.documentOperations(
        module.client,
        {
          filter: {
            documentId: testDoc.header.id,
            branch: null,
            scopes: null,
            actionTypes: null,
            sinceRevision: null,
            timestampFrom: null,
            timestampTo: null,
          },
          paging: null,
        },
      );

      const setNameOp = operationsResult.items.find(
        (op) => op.action.type === "SET_MODEL_NAME",
      );
      const setDescOp = operationsResult.items.find(
        (op) => op.action.type === "SET_MODEL_DESCRIPTION",
      );

      expect(setNameOp).toBeDefined();
      expect(setDescOp).toBeDefined();

      const retrievedSigner1 = setNameOp?.action.context?.signer;
      const retrievedSigner2 = setDescOp?.action.context?.signer;

      expect(retrievedSigner1).toStrictEqual(originalSigner1);
      expect(retrievedSigner2).toStrictEqual(originalSigner2);
    });

    it("should preserve signer context when querying operations back", async () => {
      const ctx = createAdminContext();
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      // Use the same signer configured on the ReactorClient
      const signer = defaultSigner;
      const userAddress = signer.user?.address ?? "";
      const networkId = signer.user?.networkId ?? "";
      const chainId = signer.user?.chainId ?? 0;
      const appName = signer.app?.name ?? "";

      const baseAction = documentModelDocumentModelModule.actions.setModelName({
        name: "Preserved Signer Test",
      });
      const signedAction = await signAction(baseAction, signer);

      // Verify the signed action has the expected signer context before submission
      expect(signedAction.context?.signer).toBeDefined();
      expect(signedAction.context?.signer?.user?.address).toBe(userAddress);
      expect(signedAction.context?.signer?.user?.networkId).toBe(networkId);
      expect(signedAction.context?.signer?.user?.chainId).toBe(chainId);
      expect(signedAction.context?.signer?.app?.name).toBe(appName);

      // Mutate the document with a signed action
      await callMutateDocument(ctx, testDoc.header.id, [signedAction]);

      // Query the document operations using the resolver
      const operationsResult = await resolvers.documentOperations(
        module.client,
        {
          filter: {
            documentId: testDoc.header.id,
            branch: null,
            scopes: null,
            actionTypes: null,
            sinceRevision: null,
            timestampFrom: null,
            timestampTo: null,
          },
          paging: null,
        },
      );

      expect(operationsResult.items.length).toBeGreaterThan(0);

      // Find the SET_MODEL_NAME operation
      const setNameOperation = operationsResult.items.find(
        (op) => op.action.type === "SET_MODEL_NAME",
      );
      expect(setNameOperation).toBeDefined();

      // Verify signer context is preserved
      const operationSigner = setNameOperation?.action.context?.signer;
      expect(operationSigner).toBeDefined();

      if (operationSigner) {
        // Verify signer data is preserved with actual values
        expect(operationSigner.user?.address).toBe(userAddress);
        expect(operationSigner.user?.networkId).toBe(networkId);
        expect(operationSigner.user?.chainId).toBe(chainId);
        expect(operationSigner.app?.name).toBe(appName);
        expect(operationSigner.signatures).toBeDefined();
        expect(operationSigner.signatures.length).toBeGreaterThan(0);
      }
    });
  });

  describe("signer context with different network configurations", () => {
    const callMutateDocument = async (
      ctx: Context,
      documentIdentifier: string,
      actions: unknown[],
    ) => {
      const mutation = (
        reactorSubgraph.resolvers.Mutation as Record<string, unknown>
      ).mutateDocument as (
        parent: unknown,
        args: {
          documentIdentifier: string;
          actions: unknown[];
          view?: {
            branch?: string | null;
            scopes?: readonly string[] | null;
          } | null;
        },
        ctx: Context,
      ) => Promise<unknown>;
      return mutation(null, { documentIdentifier, actions }, ctx);
    };

    const networkConfigs = [
      { name: "Ethereum Mainnet", networkId: "eip155", chainId: 1 },
      { name: "Polygon", networkId: "eip155", chainId: 137 },
      { name: "Arbitrum One", networkId: "eip155", chainId: 42161 },
      { name: "Optimism", networkId: "eip155", chainId: 10 },
      { name: "Base", networkId: "eip155", chainId: 8453 },
      { name: "Gnosis Chain", networkId: "eip155", chainId: 100 },
    ];

    networkConfigs.forEach(({ name, networkId, chainId }) => {
      it(`should accept signer from ${name} (chainId: ${chainId})`, async () => {
        const ctx = createAdminContext();
        const testDoc = createTestDocument();
        await module.client.create(testDoc);

        const signer = await createSigner({
          user: {
            address: `0x${chainId.toString(16).padStart(40, "0")}`,
            networkId,
            chainId,
          },
        });

        const baseAction =
          documentModelDocumentModelModule.actions.setModelName({
            name: `${name} Test`,
          });
        const signedAction = await signAction(baseAction, signer);

        const result = await callMutateDocument(ctx, testDoc.header.id, [
          signedAction,
        ]);

        expect(result).toBeDefined();
      });
    });
  });

  describe("documentOperations query with signer data", () => {
    it("should return operations with signer context via documentOperations query", async () => {
      const ctx = createAdminContext();
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const signer = await createSigner({
        user: {
          address: "0xquerytest1234567890abcdef1234567890abc",
          networkId: "eip155",
          chainId: 1,
        },
      });

      const baseAction = documentModelDocumentModelModule.actions.setModelName({
        name: "Query Test",
      });
      const signedAction = await signAction(baseAction, signer);

      // Execute via resolver
      await resolvers.mutateDocument(module.client, {
        documentIdentifier: testDoc.header.id,
        actions: [signedAction],
        view: null,
      });

      // Query operations via the Query resolver
      const queryResolver = (
        reactorSubgraph.resolvers.Query as Record<string, unknown>
      ).documentOperations as (
        parent: unknown,
        args: {
          filter: {
            documentId: string;
            branch?: string | null;
            scopes?: readonly string[] | null;
            actionTypes?: readonly string[] | null;
            sinceRevision?: number | null;
            timestampFrom?: string | null;
            timestampTo?: string | null;
          };
          paging?: { limit?: number | null; cursor?: string | null } | null;
        },
        ctx: Context,
      ) => Promise<{
        items: Array<{
          action: { type: string; context?: { signer?: unknown } };
        }>;
      }>;

      const result = await queryResolver(
        null,
        {
          filter: { documentId: testDoc.header.id },
          paging: { limit: 10 },
        },
        ctx,
      );

      expect(result.items.length).toBeGreaterThan(0);

      const setNameOp = result.items.find(
        (op) => op.action.type === "SET_MODEL_NAME",
      );
      expect(setNameOp).toBeDefined();
      expect(setNameOp?.action.context?.signer).toBeDefined();
    });
  });
});
