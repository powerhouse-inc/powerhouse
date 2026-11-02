import type {
  Action,
  DocumentModelDocument,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  generateId,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { undoV3Flags } from "../factories.js";

function retract(scope: string, target: string, timestampUtcMs?: string) {
  return {
    id: generateId(),
    type: "RETRACT",
    scope,
    timestampUtcMs: timestampUtcMs ?? new Date().toISOString(),
    input: { target },
  } as Action;
}

describe("RETRACT outside the retraction rule", () => {
  let module: InProcessReactorModule | undefined;
  let docId: string;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build(
    version: 1 | 2 | 3,
    featureFlags: Partial<ReactorFeatureFlags> = {},
  ): Promise<void> {
    module = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({
        featureFlags: version === 3 ? undoV3Flags(featureFlags) : featureFlags,
      })
      .buildModule();
    const document = withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
      { id: generateId(), protocolVersions: { "base-reducer": version } },
    );
    docId = document.header.id;
    const created = await settle(await module.reactor.create(document));
    expect(created.error?.message ?? created.status).toBe(JobStatus.READ_READY);
    expect(
      (await module.reactor.get(docId)).header.protocolVersions?.[
        "base-reducer"
      ],
    ).toBe(version);
  }

  async function settle(job: JobInfo): Promise<JobInfo> {
    let status = await module!.reactor.getJobStatus(job.id);
    while (
      status.status !== JobStatus.READ_READY &&
      status.status !== JobStatus.FAILED
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      status = await module!.reactor.getJobStatus(job.id);
    }
    return status;
  }

  async function execute(actions: Action[]): Promise<JobInfo> {
    return settle(await module!.reactor.execute(docId, "main", actions));
  }

  async function load(operations: Operation[]): Promise<JobInfo> {
    return settle(await module!.reactor.load(docId, "main", operations));
  }

  function asOperation(action: Action, index: number): Operation {
    return {
      id: deriveOperationId(docId, action.scope, "main", action.id),
      index,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };
  }

  async function stream(scope: string): Promise<Operation[]> {
    const result = await module!.reactor.getOperations(docId, {
      branch: "main",
      scopes: [scope],
    });
    const page = result[scope] as { results: Operation[] } | undefined;
    return page?.results ?? [];
  }

  async function moduleIds(): Promise<string[]> {
    const document = await module!.reactor.get<DocumentModelDocument>(docId);
    return document.state.global.specifications
      .flatMap((specification) => specification.modules)
      .map((m) => m.id);
  }

  function expectRefused(job: JobInfo): void {
    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.error?.name).toBe("ReservedActionError");
    expect(job.job?.retryCount ?? 0).toBe(0);
  }

  describe.each([1, 2] as const)("base-reducer %i", (version) => {
    it("stores a submitted RETRACT as an ordinary row and applies nothing", async () => {
      await build(version);
      const job = await execute([addModule({ id: "a", name: "a" })]);
      expect(job.status).toBe(JobStatus.READ_READY);
      const [a] = await stream("global");

      const submitted = retract("global", a.action.id);
      const stored = await execute([submitted]);

      expect(stored.error?.message ?? stored.status).toBe(JobStatus.READ_READY);
      expect((await stream("global")).map((op) => op.action.id)).toEqual([
        a.action.id,
        submitted.id,
      ]);
      expect(await moduleIds()).toEqual(["a"]);
    });

    it("applies ordinary writes and undo as before", async () => {
      await build(version);
      expect((await execute([addModule({ id: "a", name: "a" })])).status).toBe(
        JobStatus.READ_READY,
      );
      expect((await execute([addModule({ id: "b", name: "b" })])).status).toBe(
        JobStatus.READ_READY,
      );
      expect(
        (
          await execute([
            { type: "UNDO", scope: "global", input: { count: 1 } } as never,
          ])
        ).status,
      ).toBe(JobStatus.READ_READY);

      expect(await moduleIds()).toEqual(["a"]);
    });

    it("admits a loaded RETRACT as an inert row", async () => {
      await build(version);
      await execute([addModule({ id: "a", name: "a" })]);
      const [a] = await stream("global");

      const loaded = retract("global", a.action.id);
      const job = await load([asOperation(loaded, 1)]);

      expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
      expect((await stream("global")).map((op) => op.action.id)).toEqual([
        a.action.id,
        loaded.id,
      ]);
      expect(await moduleIds()).toEqual(["a"]);
    });
  });

  it.each(["auth", "document"])(
    "refuses a submitted RETRACT in the %s scope and writes nothing",
    async (scope) => {
      await build(3);
      const before = await stream(scope);

      expectRefused(await execute([retract(scope, "anything")]));

      expect(await stream(scope)).toEqual(before);
    },
  );

  it("re-appends a stored RETRACT when a backdated write moves it", async () => {
    await build(2, { documentDecisions: true });
    await execute([addModule({ id: "a", name: "a" })]);
    const [a] = await stream("global");
    const loaded = retract("global", a.action.id);
    expect((await load([asOperation(loaded, 1)])).status).toBe(
      JobStatus.READ_READY,
    );

    const early = {
      ...addModule({ id: "z", name: "z" }),
      timestampUtcMs: new Date(Date.now() - 600_000).toISOString(),
    };
    const job = await execute([early]);

    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    const ids = (await stream("global")).map((op) => op.action.id);
    expect(ids.filter((id) => id === loaded.id).length).toBeGreaterThan(0);
    expect((await moduleIds()).sort()).toEqual(["a", "z"]);
  });
});
