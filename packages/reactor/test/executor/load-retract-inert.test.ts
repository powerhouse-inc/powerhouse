import type {
  Action,
  DocumentModelDocument,
  Grant,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  initializeAuth,
  undo,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

const AUTH_ADMIN_GRANT: Grant = {
  id: "g-auth-admin",
  description: "anyone may administer the policy",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "auth" },
};

type Row = Pick<Operation, "index" | "skip" | "error"> & {
  type: string;
  input: unknown;
};

// Older reactors store any action type, so load must admit what they wrote.
describe("a RETRACT loaded outside the retraction rule", () => {
  const modules: InProcessReactorModule[] = [];
  let docId: string;

  afterEach(() => {
    for (const module of modules.splice(0)) {
      module.reactor.kill();
    }
  });

  async function replicas(
    featureFlags: Partial<ReactorFeatureFlags> = {},
  ): Promise<[InProcessReactorModule, InProcessReactorModule]> {
    const document = createDocModelDocument({
      id: `retract-inert-${modules.length}`,
      protocolVersions: { "base-reducer": 2 },
    });
    docId = document.header.id;
    for (let i = 0; i < 2; i++) {
      const module = await new ReactorBuilder()
        .withDocumentModelSources([documentModelDocumentModelModule as never])
        .withExecutorConfig({ featureFlags })
        .buildModule();
      modules.push(module);
      await ok(module, await module.reactor.create(document));
    }
    return [modules.at(-2)!, modules.at(-1)!];
  }

  async function settle(
    module: InProcessReactorModule,
    job: JobInfo,
  ): Promise<JobInfo> {
    let status = await module.reactor.getJobStatus(job.id);
    while (
      status.status !== JobStatus.READ_READY &&
      status.status !== JobStatus.FAILED
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      status = await module.reactor.getJobStatus(job.id);
    }
    return status;
  }

  async function ok(module: InProcessReactorModule, job: JobInfo) {
    const status = await settle(module, job);
    expect(status.error?.message ?? status.status).toBe(JobStatus.READ_READY);
  }

  async function execute(module: InProcessReactorModule, actions: Action[]) {
    await ok(module, await module.reactor.execute(docId, "main", actions));
  }

  async function load(module: InProcessReactorModule, rows: Operation[]) {
    await ok(module, await module.reactor.load(docId, "main", rows));
  }

  async function stored(
    module: InProcessReactorModule,
    scope: string,
  ): Promise<Operation[]> {
    const result = (await module.reactor.getOperations(docId, {
      branch: "main",
      scopes: [scope],
    })) as Record<string, { results: Operation[] } | undefined>;
    return result[scope]?.results ?? [];
  }

  async function rows(
    module: InProcessReactorModule,
    scope: string,
  ): Promise<Row[]> {
    return (await stored(module, scope)).map((operation) => ({
      index: operation.index,
      skip: operation.skip,
      error: operation.error,
      type: operation.action.type,
      input: operation.action.input,
    }));
  }

  async function served(module: InProcessReactorModule): Promise<PHDocument> {
    return module.reactor.get(docId);
  }

  async function rebuilt(
    module: InProcessReactorModule,
    scope: string,
  ): Promise<PHDocument> {
    module.writeCache.invalidate(docId);
    return module.writeCache.getState(docId, scope, "main");
  }

  function moduleIds(document: PHDocument): string[] {
    return (
      document as DocumentModelDocument
    ).state.global.specifications[0].modules.map((entry) => entry.id);
  }

  function retract(scope: string, target: string, at: number): Operation {
    const action: Action = {
      id: `retract-${scope}`,
      type: "RETRACT",
      scope,
      input: { target },
      timestampUtcMs: new Date(at).toISOString(),
    };
    return asOperation(action, 0);
  }

  function asOperation(action: Action, index: number, skip = 0): Operation {
    return {
      id: deriveOperationId(docId, action.scope, "main", action.id),
      index,
      skip,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };
  }

  /** The RETRACT row as `from` stored it, loaded into `to`. */
  async function relay(
    from: InProcessReactorModule,
    to: InProcessReactorModule,
    scope: string,
    actionId: string,
  ): Promise<void> {
    const row = (await stored(from, scope)).find(
      (operation) => operation.action.id === actionId,
    )!;
    await load(to, [row]);
  }

  describe("base-reducer 2", () => {
    it("stores it as an ordinary row on every replica and applies nothing", async () => {
      const [a, b] = await replicas();
      await execute(a, [addModule({ id: "x", name: "x" })]);
      await execute(a, [addModule({ id: "y", name: "y" })]);
      await load(b, await stored(a, "global"));
      const y = (await stored(a, "global"))[1].action.id;

      await load(a, [{ ...retract("global", y, Date.now()), index: 2 }]);
      await relay(a, b, "global", "retract-global");

      for (const replica of [a, b]) {
        expect(await rows(replica, "global")).toEqual([
          expect.objectContaining({ index: 0, skip: 0, type: "ADD_MODULE" }),
          expect.objectContaining({ index: 1, skip: 0, type: "ADD_MODULE" }),
          {
            index: 2,
            skip: 0,
            error: undefined,
            type: "RETRACT",
            input: { target: y },
          },
        ]);
        expect(moduleIds(await served(replica))).toEqual(["x", "y"]);
        expect(moduleIds(await rebuilt(replica, "global"))).toEqual(["x", "y"]);
      }
    });

    // garbageCollectV2 counts the RETRACT as the row the UNDO's NOOP retracts.
    it("leaves an UNDO directly after it nothing visible to retract", async () => {
      const [a, b] = await replicas();
      await execute(a, [addModule({ id: "x", name: "x" })]);
      await load(b, await stored(a, "global"));
      const x = (await stored(a, "global"))[0].action.id;
      await load(a, [{ ...retract("global", x, Date.now()), index: 1 }]);
      await relay(a, b, "global", "retract-global");

      await execute(a, [undo()]);
      const noop = (await stored(a, "global")).at(-1)!;
      await load(b, [noop]);

      for (const replica of [a, b]) {
        expect(
          (await rows(replica, "global")).map(
            (row) => `${row.index}:${row.type}/${row.skip}`,
          ),
        ).toEqual(["0:ADD_MODULE/0", "1:RETRACT/0", "2:NOOP/1"]);
        expect(moduleIds(await served(replica))).toEqual(["x"]);
        expect(moduleIds(await rebuilt(replica, "global"))).toEqual(["x"]);
      }
    });
  });

  describe.each([
    ["without decisions", {}],
    ["with decisions", { documentDecisions: true }],
  ])("the auth scope, %s", (_label, featureFlags) => {
    it("stores it as an ordinary row on every replica and applies nothing", async () => {
      const [a, b] = await replicas(featureFlags);
      await execute(a, [
        initializeAuth({ version: 1, grants: [AUTH_ADMIN_GRANT] }),
      ]);
      await load(b, await stored(a, "auth"));
      const [initialized] = await stored(a, "auth");
      const before = (await served(a)).state.auth;
      expect(initialized.error).toBeUndefined();
      expect(JSON.stringify(before)).toContain(AUTH_ADMIN_GRANT.id);

      const after = new Date(initialized.timestampUtcMs).getTime() + 1_000;
      await load(a, [
        { ...retract("auth", initialized.action.id, after), index: 1 },
      ]);
      await relay(a, b, "auth", "retract-auth");

      for (const replica of [a, b]) {
        expect((await rows(replica, "auth")).at(-1)).toEqual({
          index: 1,
          skip: 0,
          error: undefined,
          type: "RETRACT",
          input: { target: initialized.action.id },
        });
        expect((await served(replica)).state.auth).toEqual(before);
        expect((await rebuilt(replica, "auth")).state.auth).toEqual(before);
      }
    });
  });

  describe("the document scope", () => {
    it("stores it as an ordinary row on every replica and applies nothing", async () => {
      const [a, b] = await replicas();
      const documentRows = await stored(a, "document");
      const upgrade = documentRows.at(-1)!;
      const before = await served(a);

      const after = new Date(upgrade.timestampUtcMs).getTime() + 1_000;
      await load(a, [
        {
          ...retract("document", upgrade.action.id, after),
          index: documentRows.length,
        },
      ]);
      await relay(a, b, "document", "retract-document");

      for (const replica of [a, b]) {
        expect((await rows(replica, "document")).at(-1)).toEqual({
          index: documentRows.length,
          skip: 0,
          error: undefined,
          type: "RETRACT",
          input: { target: upgrade.action.id },
        });
        const document = await served(replica);
        expect(document.state).toEqual(before.state);
        expect(document.header.protocolVersions).toEqual(
          before.header.protocolVersions,
        );
        expect(document.header.documentType).toBe(before.header.documentType);
      }
    });
  });
});
