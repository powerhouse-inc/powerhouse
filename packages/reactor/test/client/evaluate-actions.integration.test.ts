import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  Grant,
  PHBaseState,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  AUTH_NO_GRANT_REASON,
  baseCreateDocument,
  createReducer,
  defaultBaseState,
  DOCUMENT_DELETED_REASON,
  generateId,
  groupDocumentType,
  initializeAuth,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import type { ActionCandidate } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { AuthEnforcementDisabledError } from "../../src/shared/errors.js";
import { createDocModelDocument } from "../factories.js";

const MEMBER = "0xMember";
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

type GroupPHState = PHBaseState & {
  global: { members: string[] };
  local: Record<string, never>;
};

const groupStateReducer: StateReducer<GroupPHState> = (state, action) => {
  const input = action.input as { address: string };
  switch (action.type) {
    case "ADD_MEMBER":
      state.global.members.push(input.address);
      return state;
    default:
      return state;
  }
};

const groupCreateState = (state?: Partial<GroupPHState>): GroupPHState =>
  ({
    ...defaultBaseState(),
    global: { members: [], ...state?.global },
    local: {},
  }) as GroupPHState;

const fakeGroupModule = {
  version: 1,
  reducer: createReducer<GroupPHState>(groupStateReducer),
  actions: {},
  utils: {
    createDocument: (state?: Partial<GroupPHState>) =>
      baseCreateDocument(groupCreateState, state, groupDocumentType),
  },
  documentModel: {
    global: {
      id: groupDocumentType,
      name: "Reactor Group",
      extension: ".phrg",
      description: "test group model",
      author: { name: "test", website: "" },
      specifications: [],
    },
    local: {},
  },
} as unknown as DocumentModelModule;

function execute(
  scope: string,
  type: string,
  input?: unknown,
): ActionCandidate {
  return { scope, type, input };
}

describe("the authorization preflight end to end", () => {
  let reactor: IReactor | undefined;

  afterEach(() => {
    reactor?.kill();
    reactor = undefined;
  });

  async function build(
    flags: Partial<ReactorFeatureFlags>,
  ): Promise<ReactorClient> {
    const module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            documentModelDocumentModelModule as never,
            driveDocumentModelModule as never,
            fakeGroupModule,
          ])
          .withExecutorConfig({ featureFlags: flags }),
      )
      .buildModule();

    reactor = module.reactor;
    return module.client;
  }

  async function policied(
    client: ReactorClient,
    id: string,
    grants: Grant[],
  ): Promise<string> {
    const document = createDocModelDocument({ id });
    await client.create(document);
    await client.execute(document.header.id, "main", [
      initializeAuth({ version: 1, grants }),
    ]);
    return document.header.id;
  }

  /**
   * The hard requirement, read through the builder: below authEnforcement the
   * client resolves no decision model, so the preflight refuses instead of
   * answering from the legacy host-side permission tables.
   */
  describe("below authEnforcement", () => {
    it("refuses with every flag off", async () => {
      const client = await build({});
      const document = createDocModelDocument({ id: "preflight-flags-off" });
      await client.create(document);

      await expect(
        client.evaluateActions(document.header.id, "main", [
          execute("global", "SET_MODEL_NAME"),
        ]),
      ).rejects.toThrow(AuthEnforcementDisabledError);
    });

    /**
     * documentDecisions alone selects the document-only model, which ignores
     * the auth scope entirely. Answering from it would report every operation
     * on a policied document as admissible.
     */
    it("refuses with documentDecisions alone", async () => {
      const client = await build({ documentDecisions: true });
      const document = createDocModelDocument({ id: "preflight-doc-only" });
      await client.create(document);

      await expect(
        client.evaluateActions(document.header.id, "main", [
          execute("global", "SET_MODEL_NAME"),
        ]),
      ).rejects.toThrow(AuthEnforcementDisabledError);
    });
  });

  it("answers allow or deny per the document's own grants", async () => {
    const client = await build(ENFORCING);
    const documentId = await policied(client, "preflight-granted", [
      {
        id: "g-writer",
        description: "one writer writes the global scope",
        effect: "allow",
        principal: { address: WRITER },
        capability: { can: "execute", scope: "global" },
      },
      adminGrant,
    ]);

    const allowed = await client.evaluateActions(
      documentId,
      "main",
      [execute("global", "SET_MODEL_NAME")],
      { subject: { address: WRITER } },
    );
    const refused = await client.evaluateActions(
      documentId,
      "main",
      [execute("global", "SET_MODEL_NAME")],
      { subject: { address: OUTSIDER } },
    );

    expect(allowed.evaluations).toEqual([{ decision: "allow" }]);
    expect(refused.evaluations).toEqual([
      { decision: "deny", reason: AUTH_NO_GRANT_REASON },
    ]);
    expect(allowed.allAllowed).toBe(true);
    expect(refused.allDenied).toBe(true);
  });

  /**
   * The subject defaults to the client's own signer, which is the anonymous
   * passthrough here, and `view.subject` replaces it. A server answering many
   * principals over one client depends on the override being the deciding
   * subject rather than an annotation.
   */
  it("decides for the signer by default and for the subject the view names", async () => {
    const client = await build(ENFORCING);
    const documentId = await policied(client, "preflight-subject", [
      {
        id: "g-writer",
        description: "one writer writes the global scope",
        effect: "allow",
        principal: { address: WRITER },
        capability: { can: "execute", scope: "global" },
      },
      adminGrant,
    ]);

    const asSigner = await client.evaluateActions(documentId, "main", [
      execute("global", "SET_MODEL_NAME"),
    ]);
    const asWriter = await client.evaluateActions(
      documentId,
      "main",
      [execute("global", "SET_MODEL_NAME")],
      { subject: { address: WRITER } },
    );

    expect(asSigner.anyAllowed).toBe(false);
    expect(asWriter.allAllowed).toBe(true);
  });

  /**
   * An uninitialized policy leaves a document open, which is what every
   * document created before auth existed carries. Reporting those as denied
   * would grey out every control in the app.
   */
  it("allows everything on an unpoliced document", async () => {
    const client = await build(ENFORCING);
    const document = createDocModelDocument({ id: "preflight-unpoliced" });
    await client.create(document);

    const answer = await client.evaluateActions(
      document.header.id,
      "main",
      [
        execute("global", "SET_MODEL_NAME"),
        execute("local", "SET_MODEL_NAME"),
        execute("auth", "SET_GRANT"),
      ],
      { subject: { address: OUTSIDER } },
    );

    expect(answer.allAllowed).toBe(true);
  });

  /**
   * Deletion refuses an execute, and the read that reaches the boundary state
   * is what lets the preflight see it. A UI over a deleted document should
   * report its controls dead rather than throwing on the way to finding out.
   */
  it("denies executing against a deleted document", async () => {
    const client = await build(ENFORCING);
    const document = createDocModelDocument({ id: "preflight-deleted" });
    await client.create(document);
    await client.deleteDocument(document.header.id);

    const answer = await client.evaluateActions(document.header.id, "main", [
      execute("global", "SET_MODEL_NAME"),
    ]);

    expect(answer.evaluations).toEqual([
      { decision: "deny", reason: DOCUMENT_DELETED_REASON },
    ]);
  });

  /**
   * A `{ group }` grant matches only against the groups projection, which the
   * model carries only while authGroups is on. Below it the grant fails closed
   * at admission, so it has to fail closed here too or the preflight would
   * enable a control the submit refuses.
   */
  describe("a group grant", () => {
    async function groupGated(
      client: ReactorClient,
      id: string,
    ): Promise<string> {
      const group = baseCreateDocument(
        groupCreateState,
        undefined,
        groupDocumentType,
      );
      await client.create(group);
      await client.execute(group.header.id, "main", [
        {
          id: generateId(),
          type: "ADD_MEMBER",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: { address: MEMBER },
        },
      ]);

      return policied(client, id, [
        {
          id: "g-group-writes",
          description: "the group writes the global scope",
          effect: "allow",
          principal: { group: group.header.id },
          capability: { can: "execute", scope: "global" },
        },
        adminGrant,
      ]);
    }

    it("allows a member with authGroups on", async () => {
      const client = await build({ ...ENFORCING, authGroups: true });
      const documentId = await groupGated(client, "preflight-group-on");

      const member = await client.evaluateActions(
        documentId,
        "main",
        [execute("global", "SET_MODEL_NAME")],
        { subject: { address: MEMBER } },
      );
      const outsider = await client.evaluateActions(
        documentId,
        "main",
        [execute("global", "SET_MODEL_NAME")],
        { subject: { address: OUTSIDER } },
      );

      expect(member.allAllowed).toBe(true);
      expect(outsider.allDenied).toBe(true);
    });

    it("never applies the grant with authGroups off", async () => {
      const client = await build(ENFORCING);
      const documentId = await groupGated(client, "preflight-group-off");

      const member = await client.evaluateActions(
        documentId,
        "main",
        [execute("global", "SET_MODEL_NAME")],
        { subject: { address: MEMBER } },
      );

      expect(member.allDenied).toBe(true);
    });
  });

  /**
   * A conditional grant reads the action input, which is the one part of a
   * candidate a UI must supply for the prediction to be about the operation it
   * is going to submit. Omitting it predicts the denial an empty input earns.
   */
  describe("a conditional grant", () => {
    const nameMustBeAgreed: Grant = {
      id: "g-agreed-name",
      description: "the name may only be set to the agreed one",
      effect: "allow",
      principal: { anyone: true },
      capability: { can: "execute", scope: "global" },
      where: { eq: [{ attr: "action.input.name" }, { lit: "agreed" }] },
    };

    const CONDITIONAL: Partial<ReactorFeatureFlags> = {
      ...ENFORCING,
      authGroups: true,
      authConditions: true,
    };

    it("allows the input the condition names and denies the one it does not", async () => {
      const client = await build(CONDITIONAL);
      const documentId = await policied(client, "preflight-condition-on", [
        nameMustBeAgreed,
        adminGrant,
      ]);

      const answer = await client.evaluateActions(documentId, "main", [
        execute("global", "SET_MODEL_NAME", { name: "agreed" }),
        execute("global", "SET_MODEL_NAME", { name: "something else" }),
      ]);

      expect(answer.evaluations).toEqual([
        { decision: "allow" },
        { decision: "deny", reason: AUTH_NO_GRANT_REASON },
      ]);
    });

    it("denies a candidate whose input was left out", async () => {
      const client = await build(CONDITIONAL);
      const documentId = await policied(client, "preflight-condition-blank", [
        nameMustBeAgreed,
        adminGrant,
      ]);

      const answer = await client.evaluateActions(documentId, "main", [
        execute("global", "SET_MODEL_NAME"),
      ]);

      expect(answer.allDenied).toBe(true);
    });

    it("never applies the condition with authConditions off", async () => {
      const client = await build({ ...ENFORCING, authGroups: true });
      const documentId = await policied(client, "preflight-condition-off", [
        nameMustBeAgreed,
        adminGrant,
      ]);

      const answer = await client.evaluateActions(documentId, "main", [
        execute("global", "SET_MODEL_NAME", { name: "agreed" }),
      ]);

      expect(answer.allDenied).toBe(true);
    });
  });

  /**
   * A document-scope candidate is decided against the document its input names,
   * not the one the request named. Deciding against the request's document
   * would let a caller ask about a document it controls in order to be told it
   * may delete one it does not.
   */
  describe("a document-scope candidate naming another document", () => {
    async function pair(
      client: ReactorClient,
    ): Promise<{ open: string; closed: string }> {
      const open = await policied(client, "preflight-open", [
        {
          id: "g-open-document",
          description: "anyone writes the document scope",
          effect: "allow",
          principal: { anyone: true },
          capability: { can: "execute", scope: "document" },
        },
        adminGrant,
      ]);
      const closed = await policied(client, "preflight-closed", [adminGrant]);
      return { open, closed };
    }

    it("decides a delete against the target's policy", async () => {
      const client = await build(ENFORCING);
      const { open, closed } = await pair(client);

      const ownDelete = await client.evaluateActions(open, "main", [
        execute("document", "DELETE_DOCUMENT", { documentId: open }),
      ]);
      const otherDelete = await client.evaluateActions(open, "main", [
        execute("document", "DELETE_DOCUMENT", { documentId: closed }),
      ]);

      expect(ownDelete.allAllowed).toBe(true);
      expect(otherDelete.evaluations).toEqual([
        { decision: "deny", reason: AUTH_NO_GRANT_REASON },
      ]);
    });

    it("decides a relationship against its source's policy", async () => {
      const client = await build(ENFORCING);
      const { open, closed } = await pair(client);

      const answer = await client.evaluateActions(open, "main", [
        execute("document", "ADD_RELATIONSHIP", {
          sourceId: open,
          targetId: closed,
          type: "child",
        }),
        execute("document", "ADD_RELATIONSHIP", {
          sourceId: closed,
          targetId: open,
          type: "child",
        }),
      ]);

      expect(answer.evaluations).toEqual([
        { decision: "allow" },
        { decision: "deny", reason: AUTH_NO_GRANT_REASON },
      ]);
    });
  });
});
