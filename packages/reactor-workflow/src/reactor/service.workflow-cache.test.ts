// Trigger runs read the workflow from the runtime's cache, kept current by the
// operation feed; manual fires always load it from the reactor.
import {
  REACTOR_SCHEMA,
  ReactorBuilder,
  ReactorClientBuilder,
  supportsLiveReadModelRegistration,
  type DocumentViewDatabase,
  type IReactorClient,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  Workflow,
  actions,
} from "@powerhousedao/workflow/document-models/workflow";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../pieces/index.js";
import type { WorkflowRuntimeService } from "./service.js";
import {
  WORKFLOW_TRIGGERS_READ_MODEL_STAGE,
  WorkflowTriggersReadModel,
} from "./workflow-triggers-read-model.js";

const CTX = { user: { address: "0xcaller" } } as never;

describe("workflow cache", () => {
  let module: InProcessReactorClientModule;
  let service: WorkflowRuntimeService;
  let get: MockInstance<IReactorClient["get"]>;
  let realGet: IReactorClient["get"];
  let workflowId: string;

  const drain = () => module.reactorModule!.readModelCoordinator.drain();
  const loads = () => get.mock.calls.filter(([id]) => id === workflowId).length;

  beforeAll(async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule as unknown as DocumentModelModule,
          Workflow as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
    service = testRuntime({
      reactorClient: module.client,
      relationalDb: createFreshRelationalDb(),
    });
    const reactor = module.reactorModule!;
    const model = new WorkflowTriggersReadModel(
      (reactor.database as unknown as Kysely<unknown>).withSchema(
        REACTOR_SCHEMA,
      ) as unknown as Kysely<DocumentViewDatabase>,
      reactor.operationIndex,
      reactor.writeCache,
      reactor.processorManagerConsistencyTracker,
      service,
    );
    await model.init();
    const coordinator = reactor.readModelCoordinator;
    if (!supportsLiveReadModelRegistration(coordinator)) {
      throw new Error("coordinator takes no live registration");
    }
    coordinator.addReadModel(model, WORKFLOW_TRIGGERS_READ_MODEL_STAGE);
    realGet = module.client.get.bind(module.client);
    get = vi.spyOn(module.client, "get");
  });

  afterAll(async () => {
    service.shutdown();
    await module.reactor.kill().completed;
  });

  beforeEach(async () => {
    const created = await module.client.create(
      withSignaturePolicy(Workflow.utils.createDocument(), "legacy"),
    );
    workflowId = created.header.id;
    await module.client.execute(workflowId, "main", [
      actions.setWorkflowName({ name: "Cached" }),
      actions.setTrigger({
        id: "t1",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      actions.publishWorkflow({ publishedAt: "2026-10-12T00:00:00.000Z" }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    ]);
    await drain();
    get.mockClear();
  });

  it("runs triggers from the state the registry loaded when it was enabled", async () => {
    const first = await service.fire(workflowId, {}, "schedule");
    const second = await service.fire(workflowId, {}, "schedule");

    expect([first.status, second.status]).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    expect(loads()).toBe(0);
  });

  it("loads the workflow for every manual fire", async () => {
    await service.fire(workflowId, {}, "schedule");
    await service.fire(workflowId, {}, "manual", undefined, CTX);
    await service.fire(workflowId, {}, "manual", undefined, CTX);

    expect(loads()).toBe(2);
  });

  it("gives trigger runs an edit through the operation feed", async () => {
    await service.fire(workflowId, {}, "schedule");
    await module.client.execute(workflowId, "main", [
      actions.setWorkflowStatus({ status: "DISABLED" }),
    ]);
    await drain();

    await expect(service.fire(workflowId, {}, "schedule")).rejects.toThrow(
      /DISABLED/,
    );
    expect(loads()).toBe(1);
  });

  it("does not cache a load that an operation overtook", async () => {
    const { state } = (await module.client.get(workflowId)) as unknown as {
      state: { global: unknown };
    };
    // A document-scope operation empties the entry; the next run loads.
    await service.onOperations([
      {
        operation: {
          index: 500,
          timestampUtcMs: "1",
          action: { type: "UPGRADE_DOCUMENT", input: {} },
        },
        context: {
          documentId: workflowId,
          documentType: "powerhouse/workflow",
          scope: "document",
          branch: "main",
          ordinal: 0,
        },
      } as never,
    ]);
    get.mockClear();
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let loaded!: () => void;
    const read = new Promise<void>((resolve) => (loaded = resolve));
    get.mockImplementationOnce(async (...args) => {
      const document = await realGet(...args);
      loaded();
      await released;
      return document;
    });

    const racing = service.fire(workflowId, {}, "schedule");
    // A signal, not a poll: a stalled event loop outlasts a polling deadline.
    await read;
    expect(loads()).toBe(1);
    // A newer operation lands while that read is in flight.
    await service.onOperations([
      {
        operation: {
          index: 1_000,
          timestampUtcMs: "1",
          action: { type: "SET_WORKFLOW_STATUS", input: {} },
          // Carried, as Switchboard's feed carries it: no reload follows.
          resultingState: JSON.stringify(state.global),
        },
        context: {
          documentId: workflowId,
          documentType: "powerhouse/workflow",
          scope: "global",
          branch: "main",
          ordinal: 0,
        },
      } as never,
    ]);
    release();
    await racing;
    const before = loads();

    await service.fire(workflowId, {}, "schedule");
    expect(loads()).toBe(before + 1);
  });

  it("reloads after a rename, which carries no workflow state", async () => {
    await service.fire(workflowId, {}, "schedule");
    await module.client.rename(workflowId, "Renamed");
    await drain();

    await service.fire(workflowId, {}, "schedule");
    expect(loads()).toBe(1);
  });
});
