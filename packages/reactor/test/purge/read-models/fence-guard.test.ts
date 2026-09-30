import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely, Transaction } from "kysely";
import { describe, expect, it } from "vitest";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import {
  BaseReadModel,
  type BaseReadModelConfig,
  type PurgeFence,
} from "../../../src/read-models/base-read-model.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";

class ItemsOnlyModel extends BaseReadModel {
  protected override commitOperations(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    items: OperationWithContext[],
  ): Promise<void> {
    return Promise.resolve();
  }
}

class TrxModel extends BaseReadModel {
  protected override commitOperations(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    items: OperationWithContext[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trx?: Transaction<DocumentViewDatabase>,
  ): Promise<void> {
    return Promise.resolve();
  }
}

function construct(
  Model: typeof ItemsOnlyModel | typeof TrxModel,
  purgeFence?: PurgeFence,
) {
  const config: BaseReadModelConfig = {
    readModelId: "fence-guard",
    rebuildStateOnInit: false,
    ...(purgeFence !== undefined ? { purgeFence } : {}),
  };
  return new Model(
    {} as Kysely<DocumentViewDatabase>,
    {} as IOperationIndex,
    {} as IWriteCache,
    new ConsistencyTracker(),
    config,
  );
}

describe("the purge fence guard", () => {
  it("refuses a locked model whose commitOperations takes no trx", () => {
    expect(() => construct(ItemsOnlyModel)).toThrow(/fence-guard.*"locked"/);
    expect(() => construct(ItemsOnlyModel, "locked")).toThrow(/"locked"/);
  });

  it("accepts the opt-outs and a commitOperations that takes the trx", () => {
    expect(() => construct(ItemsOnlyModel, "none")).not.toThrow();
    expect(() => construct(ItemsOnlyModel, "skip")).not.toThrow();
    expect(() => construct(TrxModel)).not.toThrow();
  });
});
