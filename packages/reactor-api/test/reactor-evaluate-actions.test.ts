import {
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
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { GraphQLError } from "graphql";
import { afterEach, describe, expect, it } from "vitest";
import * as resolvers from "../src/graphql/reactor/resolvers.js";

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
