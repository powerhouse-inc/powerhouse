import {
  type ISyncManager,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type ReactorFeatureFlags,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  AUTH_NO_GRANT_REASON,
  initializeAuth,
  type DocumentModelModule,
  type Grant,
  type ISigner,
  type PHDocument,
  type Signature,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { GraphQLError } from "graphql";
import { afterEach, describe, expect, it } from "vitest";
import * as resolvers from "../src/graphql/reactor/resolvers.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import type { IAuthorizationService } from "../src/services/authorization.service.js";

const WRITER = "0xWriter";
const OUTSIDER = "0xOutsider";

const ENFORCING: Partial<ReactorFeatureFlags> = {
  documentDecisions: true,
  authEnforcement: true,
};

/** Keeps administration reachable so a policy cannot brick itself. */
const adminGrant: Grant = {
  id: "g-admin",
  description: "administration stays reachable",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "auth" },
};

function createTestDocument(): PHDocument {
  return documentModelDocumentModelModule.utils.createDocument();
}

/** The code a caller branches on, or undefined when the error carries none. */
function codeOf(error: unknown): unknown {
  return error instanceof GraphQLError ? error.extensions.code : undefined;
}

describe("the evaluateActions resolver", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build(
    flags: Partial<ReactorFeatureFlags>,
  ): Promise<InProcessReactorClientModule> {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({ featureFlags: flags }),
      )
      .buildModule();
    return module;
  }

  /**
   * The switchboard runs without authEnforcement today, so this is the answer
   * most deployments get. It has to be distinguishable from a denial by code: a
   * client that reads it as "denied" disables every control it guards.
   */
  it("reports unsupported, not denied, when the reactor has no decision model", async () => {
    const built = await build({});
    const document = createTestDocument();
    await built.client.create(document);

    const error: unknown = await resolvers
      .evaluateActions(built.client, {
        documentIdentifier: document.header.id,
        candidates: [{ scope: "global", type: "SET_MODEL_NAME" }],
      })
      .then(
        (answer) => answer,
        (caught: unknown) => caught,
      );

    expect(codeOf(error)).toBe("AUTH_EVALUATION_UNSUPPORTED");
  });

  it("reports unsupported with documentDecisions alone", async () => {
    const built = await build({ documentDecisions: true });
    const document = createTestDocument();
    await built.client.create(document);

    const error: unknown = await resolvers
      .evaluateActions(built.client, {
        documentIdentifier: document.header.id,
        candidates: [{ scope: "global", type: "SET_MODEL_NAME" }],
      })
      .then(
        (answer) => answer,
        (caught: unknown) => caught,
      );

    expect(codeOf(error)).toBe("AUTH_EVALUATION_UNSUPPORTED");
  });

  it("allows everything on an unpoliced document", async () => {
    const built = await build(ENFORCING);
    const document = createTestDocument();
    await built.client.create(document);

    const answer = await resolvers.evaluateActions(
      built.client,
      {
        documentIdentifier: document.header.id,
        candidates: [
          { scope: "global", type: "SET_MODEL_NAME" },
          { scope: "local", type: "SET_MODEL_NAME" },
        ],
      },
      { address: OUTSIDER },
    );

    expect(answer.evaluations).toEqual([
      { decision: "ALLOW", reason: null },
      { decision: "ALLOW", reason: null },
    ]);
    expect(answer).toMatchObject({
      allAllowed: true,
      anyAllowed: true,
      allDenied: false,
      anyDenied: false,
    });
  });

  describe("against a policied document", () => {
    async function policied(
      built: InProcessReactorClientModule,
    ): Promise<string> {
      const document = createTestDocument();
      await built.client.create(document);
      await built.client.execute(document.header.id, "main", [
        initializeAuth({
          version: 1,
          grants: [
            {
              id: "g-writer",
              description: "one writer writes the global scope",
              effect: "allow",
              principal: { address: WRITER },
              capability: { can: "execute", scope: "global" },
            },
            adminGrant,
          ],
        }),
      ]);
      return document.header.id;
    }

    it("decides for the subject the caller was resolved to", async () => {
      const built = await build(ENFORCING);
      const documentId = await policied(built);

      const asWriter = await resolvers.evaluateActions(
        built.client,
        {
          documentIdentifier: documentId,
          candidates: [{ scope: "global", type: "SET_MODEL_NAME" }],
        },
        { address: WRITER },
      );
      const asOutsider = await resolvers.evaluateActions(
        built.client,
        {
          documentIdentifier: documentId,
          candidates: [{ scope: "global", type: "SET_MODEL_NAME" }],
        },
        { address: OUTSIDER },
      );

      expect(asWriter.evaluations).toEqual([
        { decision: "ALLOW", reason: null },
      ]);
      expect(asOutsider.evaluations).toEqual([
        { decision: "DENY", reason: AUTH_NO_GRANT_REASON },
      ]);
    });

    it("aggregates a mixed set", async () => {
      const built = await build(ENFORCING);
      const documentId = await policied(built);

      const answer = await resolvers.evaluateActions(
        built.client,
        {
          documentIdentifier: documentId,
          candidates: [
            { scope: "global", type: "SET_MODEL_NAME" },
            { scope: "local", type: "SET_MODEL_NAME" },
          ],
        },
        { address: WRITER },
      );

      expect(answer).toMatchObject({
        allAllowed: false,
        anyAllowed: true,
        allDenied: false,
        anyDenied: true,
      });
    });

    it("defaults the branch to main when none is given", async () => {
      const built = await build(ENFORCING);
      const documentId = await policied(built);

      // A branch that holds nothing cannot be read, so the default landing on
      // "main" is what makes the omitted argument answerable at all.
      const answer = await resolvers.evaluateActions(
        built.client,
        {
          documentIdentifier: documentId,
          branch: null,
          candidates: [{ scope: "global", type: "SET_MODEL_NAME" }],
        },
        { address: WRITER },
      );

      expect(answer.allAllowed).toBe(true);
    });

    /**
     * A candidate's input reaches the evaluator, which is what a conditional
     * grant reads. Passing it as `undefined` when omitted keeps the GraphQL
     * caller and the reactor caller predicting the same verdict.
     */
    it("carries a candidate's input through", async () => {
      const built = await build(ENFORCING);
      const documentId = await policied(built);

      const answer = await resolvers.evaluateActions(
        built.client,
        {
          documentIdentifier: documentId,
          candidates: [
            { scope: "global", type: "SET_MODEL_NAME", input: { name: "x" } },
          ],
        },
        { address: WRITER },
      );

      expect(answer.allAllowed).toBe(true);
    });
  });
});

/**
 * The document creator's standing permission over the auth scope is matched on
 * the app key, not the address. A request subject assembled without one decides
 * as a different principal than the same signer's writes do, so the creator is
 * refused an auth-scope operation their own signed action would be admitted
 * for. This walks the whole path -- token-derived context, viewSubject, the
 * preflight, the carve-out -- because every hop of it has to carry the key for
 * the answer to come out right.
 *
 * Canonical did:key/JWK pair for one P-256 key, shared with the carve-out suite
 * in document-model.
 */
const CREATOR_DID = "did:key:zDnaexNjCKnPLh5Vhn1KqjmrLDFtXddrtTTE9gJmdWRSCG3wt";
const CREATOR_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "2qGULg46dKXbnsPdvI4AxOHiw94xJRDVAWuyHIyyGd8",
  y: "V_jbfJ-wVhoUspPM9epxaJHUs_6TyMfrOgwB2Kcx170",
};
const OTHER_DID = "did:key:zDnaefv2pj8YQM2T6E3pnrJoGnDGbXsrvJiXhqHzh7d5RzncU";
const CREATOR_ADDRESS = "0xCreator";

/** A signer presenting one app key; signatures are never verified here. */
function signerWithAppKey(appKey: string): ISigner {
  return {
    publicKey: {} as unknown as CryptoKey,
    user: { address: CREATOR_ADDRESS, networkId: "eip155", chainId: 1 },
    app: { name: "test", key: appKey },
    sign: () => Promise.resolve(new Uint8Array(0)),
    verify: () => Promise.resolve(),
    signAction: () => Promise.resolve(["", "", "", "", ""] as Signature),
  };
}

describe("the creator carve-out over GraphQL", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  /**
   * Reads are permitted wholesale, so the query always runs and every verdict
   * below is the decision model's alone.
   */
  function subgraphOver(client: InProcessReactorClientModule): ReactorSubgraph {
    const permitEverything = {
      isSupremeAdmin: () => true,
      canRead: () => Promise.resolve(true),
      canWrite: () => Promise.resolve(true),
      canMutate: () => Promise.resolve(true),
      canCreate: () => true,
    } as unknown as IAuthorizationService;

    return new ReactorSubgraph({
      reactorClient: client.client,
      authorizationService: permitEverything,
      relationalDb: {} as never,
      analyticsStore: {} as never,
      graphqlManager: {
        driveOwnershipCache: {
          has: () => false,
          add: () => undefined,
          remove: () => undefined,
          size: () => 0,
        },
      } as never,
      syncManager: {} as unknown as ISyncManager,
    } as SubgraphArgs);
  }

  function contextFor(appKey: string): Context {
    return {
      user: {
        address: CREATOR_ADDRESS,
        chainId: 1,
        networkId: "eip155",
        appKey,
      },
      headers: {},
      db: {},
    };
  }

  /**
   * A document signed by the creator key, carrying a policy that denies
   * everything: only the carve-out can permit an auth-scope operation on it.
   */
  async function lockedDownDocument(): Promise<{
    subgraph: ReactorSubgraph;
    documentId: string;
  }> {
    module = await new ReactorClientBuilder()
      .withSigner(signerWithAppKey(CREATOR_DID))
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({ featureFlags: ENFORCING }),
      )
      .buildModule();

    const document = createTestDocument();
    document.header.sig.publicKey = CREATOR_JWK;
    await module.client.create(document);
    await module.client.execute(document.header.id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "lockdown",
            description: "deny everything",
            effect: "deny",
            principal: { anyone: true },
            capability: { can: "execute", scope: "*" },
          },
        ],
      }),
    ]);

    return { subgraph: subgraphOver(module), documentId: document.header.id };
  }

  function evaluate(
    subgraph: ReactorSubgraph,
    documentId: string,
    ctx: Context,
  ): Promise<{ allAllowed: boolean }> {
    const query = (
      subgraph.resolvers.Query as Record<
        string,
        (
          parent: unknown,
          args: unknown,
          ctx: Context,
        ) => Promise<{ allAllowed: boolean }>
      >
    ).evaluateActions;
    return query(
      null,
      {
        documentIdentifier: documentId,
        candidates: [{ scope: "auth", type: "SET_GRANT" }],
      },
      ctx,
    );
  }

  it("permits the creator an auth-scope operation a deny-all policy refuses", async () => {
    const { subgraph, documentId } = await lockedDownDocument();

    const answer = await evaluate(
      subgraph,
      documentId,
      contextFor(CREATOR_DID),
    );

    expect(answer.allAllowed).toBe(true);
  });

  /**
   * The same address on a different app instance is not the creator, so the
   * carve-out does not reach it. This is what proves the key decides rather
   * than merely riding along.
   */
  it("refuses the same address holding a different app key", async () => {
    const { subgraph, documentId } = await lockedDownDocument();

    const answer = await evaluate(subgraph, documentId, contextFor(OTHER_DID));

    expect(answer.allAllowed).toBe(false);
  });
});
