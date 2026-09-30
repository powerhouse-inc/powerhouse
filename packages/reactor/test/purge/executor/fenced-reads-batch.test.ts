import {
  addModule,
  baseCreateDocument,
  createReducer,
  defaultBaseState,
  generateId,
  groupDocumentType,
  initializeAuth,
  protocolVersionsFor,
  type Action,
  type DocumentModelModule,
  type PHBaseState,
  type StateReducer,
} from "@powerhousedao/shared/document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PurgeFence } from "../../../src/executor/util.js";
import { createDocModelDocument } from "../../factories.js";
import { signedAs, TRUST_ANY_SIGNER } from "../../utils/signed-as.js";
import {
  createTestDatabase,
  settled,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "./harness.js";

type Fence = { checked: Set<string> };
type Many = (this: Fence, ids: readonly string[]) => Promise<Set<string>>;

// Each round trip is one shared-lock and one tombstone statement.
let roundTrips = 0;
const proto = PurgeFence.prototype as unknown as {
  isPurged: (this: Fence, id: string) => Promise<boolean>;
  isPurgedMany?: Many;
};
const originalOne = proto.isPurged;
const originalMany = proto.isPurgedMany;
// isPurged goes through isPurgedMany once that exists.
if (originalMany) {
  proto.isPurgedMany = function (ids) {
    if (ids.some((id) => !this.checked.has(id))) roundTrips++;
    return originalMany.call(this, ids);
  };
} else {
  proto.isPurged = function (id) {
    if (!this.checked.has(id)) roundTrips++;
    return originalOne.call(this, id);
  };
}

type S = PHBaseState & {
  global: { members: string[] };
  local: Record<string, never>;
};
const reducer: StateReducer<S> = (state, action) => {
  if (action.type === "ADD_MEMBER") {
    state.global.members.push((action.input as { address: string }).address);
  }
  return state;
};
const createState = (s?: Partial<S>): S =>
  ({
    ...defaultBaseState(),
    global: { members: [], ...s?.global },
    local: {},
  }) as S;
const groupModule = {
  version: 1,
  reducer: createReducer<S>(reducer),
  actions: {},
  utils: {
    createDocument: (s?: Partial<S>) =>
      baseCreateDocument(createState, s, groupDocumentType),
  },
  documentModel: {
    global: {
      id: groupDocumentType,
      name: "Reactor Group",
      extension: ".phrg",
      description: "",
      author: { name: "t", website: "" },
      specifications: [],
    },
    local: {},
  },
} as unknown as DocumentModelModule;

const FLAGS = {
  documentDecisions: true,
  authEnforcement: true,
  authGroups: true,
};
const MEMBER = "0xMember";
const ADMIN = "0xAdmin";
const act = (type: string, scope: string, input: unknown) =>
  ({
    id: generateId(),
    type,
    scope,
    timestampUtcMs: new Date().toISOString(),
    input,
  }) as Action;

describe("fenced cross-document reads of a job's groups [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_fenced_reads_batch");
    host = await startReactor(database, {
      models: [groupModule],
      featureFlags: FLAGS,
      trustPolicy: TRUST_ANY_SIGNER,
    });
  });

  afterAll(async () => {
    proto.isPurged = originalOne;
    if (originalMany) proto.isPurgedMany = originalMany;
    try {
      await host?.kill();
    } finally {
      await database?.drop();
    }
  });

  it.each([1, 10, 50])(
    "fences %i groups in one round trip per job",
    async (groups) => {
      const ids: string[] = [];
      for (let i = 0; i < groups; i++) {
        const group = baseCreateDocument(
          createState,
          undefined,
          groupDocumentType,
          protocolVersionsFor("legacy"),
        );
        await succeeded(host.reactor, (await host.reactor.create(group)).id);
        if (i === groups - 1) {
          await succeeded(
            host.reactor,
            (
              await host.reactor.execute(group.header.id, "main", [
                act("ADD_MEMBER", "global", { address: MEMBER }),
              ])
            ).id,
          );
        }
        ids.push(group.header.id);
      }
      const target = createDocModelDocument({ id: generateId() });
      await succeeded(host.reactor, (await host.reactor.create(target)).id);
      await succeeded(
        host.reactor,
        (
          await host.reactor.execute(target.header.id, "main", [
            initializeAuth({
              version: 1,
              grants: [
                {
                  id: "g-admin",
                  description: "a",
                  effect: "allow",
                  principal: { address: ADMIN },
                  capability: { can: "execute", scope: "*" },
                },
                ...ids.map((groupId, i) => ({
                  id: `g-${i}`,
                  description: "g",
                  effect: "allow",
                  principal: { group: groupId },
                  capability: { can: "execute", scope: "global" },
                })),
              ] as never,
            }),
          ])
        ).id,
      );
      const stranger = await settled(
        host.reactor,
        (
          await host.reactor.execute(target.header.id, "main", [
            await signedAs(
              addModule({ id: "s", name: "s" }),
              "0xStranger",
              target.header.id,
            ),
          ])
        ).id,
      );
      expect(stranger.error?.name).toBe("AuthorizationDeniedError");

      roundTrips = 0;
      const jobs = 5;
      for (let i = 0; i < jobs; i++) {
        await succeeded(
          host.reactor,
          (
            await host.reactor.execute(target.header.id, "main", [
              await signedAs(
                addModule({ id: `m${i}`, name: `m${i}` }),
                MEMBER,
                target.header.id,
              ),
            ])
          ).id,
        );
      }
      expect(roundTrips / jobs).toBe(1);
    },
    300_000,
  );
});
