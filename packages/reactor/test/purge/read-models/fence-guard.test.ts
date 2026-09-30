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

type Trx = Transaction<DocumentViewDatabase>;

class NoOverrideModel extends BaseReadModel {}

class ItemsOnlyModel extends BaseReadModel {
  protected override commitOperations(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    items: OperationWithContext[],
  ): Promise<void> {
    return Promise.resolve();
  }
}

/** Takes the trx and ignores it: the old parameter-count guard let it pass. */
class UndeclaredTrxModel extends BaseReadModel {
  protected override commitOperations(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    items: OperationWithContext[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trx?: Trx,
  ): Promise<void> {
    return Promise.resolve();
  }
}

class DeclaredTrxModel extends UndeclaredTrxModel {
  static override readonly commitsInFenceTransaction = true;
}

/** Default and rest parameters shrink Function.length; the old guard misfired. */
class DefaultParamModel extends BaseReadModel {
  static override readonly commitsInFenceTransaction = true;

  protected override commitOperations(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    items: OperationWithContext[] = [],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trx?: Trx,
  ): Promise<void> {
    return Promise.resolve();
  }
}

class RestParamModel extends BaseReadModel {
  static override readonly commitsInFenceTransaction = true;

  protected override commitOperations(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: [OperationWithContext[], Trx?]
  ): Promise<void> {
    return Promise.resolve();
  }
}

class SubclassOfDeclared extends DeclaredTrxModel {}

function construct(
  Model: new (
    ...args: ConstructorParameters<typeof BaseReadModel>
  ) => BaseReadModel,
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
  it("refuses a locked override that does not declare it writes through the trx", () => {
    expect(() => construct(ItemsOnlyModel)).toThrow(/fence-guard.*"locked"/);
    expect(() => construct(ItemsOnlyModel, "locked")).toThrow(/"locked"/);
    expect(() => construct(UndeclaredTrxModel)).toThrow(
      /commitsInFenceTransaction/,
    );
  });

  it("accepts a declared override whatever its parameter list", () => {
    expect(() => construct(DeclaredTrxModel)).not.toThrow();
    expect(() => construct(DefaultParamModel)).not.toThrow();
    expect(() => construct(RestParamModel)).not.toThrow();
    expect(() => construct(SubclassOfDeclared)).not.toThrow();
  });

  it("accepts no override, and the opt-outs", () => {
    expect(() => construct(NoOverrideModel)).not.toThrow();
    expect(() => construct(ItemsOnlyModel, "none")).not.toThrow();
    expect(() => construct(ItemsOnlyModel, "skip")).not.toThrow();
    expect(() => construct(UndeclaredTrxModel, "none")).not.toThrow();
  });
});
