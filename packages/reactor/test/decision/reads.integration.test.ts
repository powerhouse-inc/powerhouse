import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  Action,
  DocumentModelModule,
  PHBaseState,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  createReducer,
  defaultBaseState,
  generateId,
  groupDocumentType,
  initializeAuth,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { createDocModelDocument } from "../factories.js";

const MEMBER = "0xMember";
const OUTSIDER = "0xOutsider";

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
    case "REMOVE_MEMBER":
      state.global.members = state.global.members.filter(
        (member) => member.toLowerCase() !== input.address.toLowerCase(),
      );
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

function action(type: string, scope: string, input: unknown): Action {
  return {
    id: generateId(),
    type,
    scope,
    timestampUtcMs: new Date().toISOString(),
    input,
  } as Action;
}

describe("the read path", () => {
  let reactor: IReactor | undefined;

  afterEach(() => {
    reactor?.kill();
    reactor = undefined;
    vi.useRealTimers();
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

  async function scopesOf(
    client: ReactorClient,
    documentId: string,
    address: string,
  ): Promise<string[]> {
    const document = await client.get(documentId, {
      subject: { address },
    });
    return Object.keys(document.state).sort();
  }

  /**
   * The stage's exit criterion for groups: a group-gated read grant follows a
   * membership change with no write to the gated document's policy at all.
   */
  it("follows a group membership change with no policy write", async () => {
    const client = await build({
      documentDecisions: true,
      authEnforcement: true,
      authGroups: true,
    });

    const group = baseCreateDocument(
      groupCreateState,
      undefined,
      groupDocumentType,
    );
    const groupId = group.header.id;
    await client.create(group);
    await client.execute(groupId, "main", [
      action("ADD_MEMBER", "global", { address: MEMBER }),
    ]);

    const statement = createDocModelDocument({ id: "reads-grouped-doc" });
    const statementId = statement.header.id;
    await client.create(statement);
    await client.execute(statementId, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-las-read",
            description: "Legal assistants read every statement",
            effect: "allow",
            principal: { group: groupId },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "*" },
          },
        ],
      }),
    ]);

    const authRevision = async () =>
      (await client.get(statementId)).header.revision.auth;
    const revisionBefore = await authRevision();

    // The member reads the gated scope; the outsider does not.
    expect(await scopesOf(client, statementId, MEMBER)).toContain("global");
    expect(await scopesOf(client, statementId, OUTSIDER)).not.toContain(
      "global",
    );

    // Removing the member from the group -- and nothing else -- withdraws it.
    await client.execute(groupId, "main", [
      action("REMOVE_MEMBER", "global", { address: MEMBER }),
    ]);

    expect(await scopesOf(client, statementId, MEMBER)).not.toContain("global");

    // And adding them back restores it, still with no policy write.
    await client.execute(groupId, "main", [
      action("ADD_MEMBER", "global", { address: MEMBER }),
    ]);

    expect(await scopesOf(client, statementId, MEMBER)).toContain("global");

    // The metadata scopes were served throughout, and the policy never moved.
    expect(await scopesOf(client, statementId, OUTSIDER)).toEqual(
      expect.arrayContaining(["auth", "document"]),
    );
    expect(await authRevision()).toBe(revisionBefore);
  });

  /**
   * The group document itself is served to the audience of the document naming
   * it, because a replica must fold the member list to evaluate auth with it.
   */
  it("serves a policy-named group to the naming document's audience", async () => {
    const client = await build({
      documentDecisions: true,
      authEnforcement: true,
      authGroups: true,
    });

    const group = baseCreateDocument(
      groupCreateState,
      undefined,
      groupDocumentType,
    );
    const groupId = group.header.id;
    await client.create(group);

    const statement = createDocModelDocument({ id: "reads-serving-doc" });
    const statementId = statement.header.id;
    await client.create(statement);
    await client.execute(statementId, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-reader",
            description: "one reader reads the statement",
            effect: "allow",
            principal: { address: MEMBER },
            capability: { can: "read", scope: "global" },
          },
          // Naming the group is what puts it in the statement's read-set, so
          // the statement's audience is owed the roster.
          {
            id: "g-group-writes",
            description: "the group may write the statement",
            effect: "allow",
            principal: { group: groupId },
            capability: { can: "execute", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "*" },
          },
        ],
      }),
    ]);

    // The group carries a deny-all policy of its own.
    await client.execute(groupId, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "*" },
          },
        ],
      }),
    ]);

    // Served anyway to the subject the naming document serves, and to nobody
    // else, because the roster is what that subject must fold.
    expect(await scopesOf(client, groupId, MEMBER)).toContain("global");
    expect(await scopesOf(client, groupId, OUTSIDER)).not.toContain("global");
  });

  /**
   * Deletion is positional, so the correct read of a deleted document is the
   * state at the deletion boundary rather than nothing at all.
   */
  describe("a deleted document", () => {
    async function createAndDelete(
      client: ReactorClient,
      id: string,
    ): Promise<string> {
      const document = createDocModelDocument({ id });
      await client.create(document);
      await client.deleteDocument(document.header.id);
      return document.header.id;
    }

    it("reads as the state at its deletion boundary", async () => {
      const client = await build({ documentDecisions: true });
      const documentId = await createAndDelete(client, "reads-deleted-doc");

      const document = await client.get(documentId);

      expect(document.header.id).toBe(documentId);
      expect(document.state.document.isDeleted).toBe(true);
      expect(Object.keys(document.state)).toContain("global");
    });

    it("still vanishes with positional deletion off", async () => {
      const client = await build({});
      const documentId = await createAndDelete(client, "reads-deleted-doc-off");

      await expect(client.get(documentId)).rejects.toThrow(/not found/);
    });

    // Serving the boundary state is a by-id read. A listing still omits it, or
    // every drive listing would start returning deleted documents.
    it("stays out of a listing", async () => {
      const client = await build({ documentDecisions: true });
      const documentId = await createAndDelete(client, "reads-deleted-listed");

      const found = await client.find({ ids: [documentId] });

      expect(found.results.map((d) => d.header.id)).not.toContain(documentId);
    });
  });
});
