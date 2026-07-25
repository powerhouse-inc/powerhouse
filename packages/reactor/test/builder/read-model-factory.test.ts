import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor, InProcessReactorModule } from "../../src/core/types.js";
import type { IReadModel } from "../../src/read-models/interfaces.js";

class StubReadModel implements IReadModel {
  readonly name = "stub-read-model";
  readonly receivedBatches: OperationWithContext[][] = [];

  indexOperations(operations: OperationWithContext[]): Promise<void> {
    this.receivedBatches.push(operations);
    return Promise.resolve();
  }
}

describe("ReactorBuilder.withReadModelFactory", () => {
  let reactor: IReactor;
  let module: InProcessReactorModule;

  afterEach(() => {
    reactor.kill();
  });

  it("invokes factory with live operationIndex/writeCache/consistencyTracker and registers the resulting read model", async () => {
    let receivedDeps:
      | {
          operationIndex: unknown;
          documentModelRegistry: unknown;
          writeCache: unknown;
          processorManagerConsistencyTracker: unknown;
        }
      | undefined;
    const stub = new StubReadModel();

    module = await new ReactorBuilder()
      .withReadModelFactory((deps) => {
        receivedDeps = {
          documentModelRegistry: deps.documentModelRegistry,
          operationIndex: deps.operationIndex,
          writeCache: deps.writeCache,
          processorManagerConsistencyTracker:
            deps.processorManagerConsistencyTracker,
        };
        return stub;
      })
      .buildModule();
    reactor = module.reactor;

    expect(receivedDeps).toBeDefined();
    expect(receivedDeps!.documentModelRegistry).toBe(
      module.documentModelRegistry,
    );
    expect(receivedDeps!.operationIndex).toBe(module.operationIndex);
    expect(receivedDeps!.writeCache).toBe(module.writeCache);
    expect(receivedDeps!.processorManagerConsistencyTracker).toBe(
      module.processorManagerConsistencyTracker,
    );
    expect(module.readModelCoordinator.readModels).toContain(stub);
  });

  it("supports async factories", async () => {
    const stub = new StubReadModel();

    module = await new ReactorBuilder()
      .withReadModelFactory(async () => {
        await Promise.resolve();
        return stub;
      })
      .buildModule();
    reactor = module.reactor;

    expect(module.readModelCoordinator.readModels).toContain(stub);
  });

  it("rejects projection shards that would silently omit factory read models", async () => {
    await expect(
      new ReactorBuilder()
        .withReadModelFactory(() => new StubReadModel())
        .withProjectionShards({
          shardCount: 1,
          preReadyKinds: [],
          postReadyKinds: [],
          db: {
            host: "localhost",
            port: 5433,
            database: "powerhouse",
            user: "powerhouse",
            password: "powerhouse",
          },
        })
        .buildModule(),
    ).rejects.toThrow(
      /withProjectionShards does not support read models registered through withReadModelFactory/,
    );
  });
});
