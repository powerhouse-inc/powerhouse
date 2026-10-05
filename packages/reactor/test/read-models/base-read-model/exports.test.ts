import { describe, expect, it } from "vitest";
import {
  BaseReadModel,
  DEFAULT_COMMIT_CHUNK_SIZE,
  DEFAULT_READ_MODEL_YIELD_DEADLINE_MS,
  defaultReadModelIndexingConfig,
  unchunkedReadModelIndexingConfig,
  type BaseReadModelConfig,
  type ReadModelIndexingConfig,
} from "../../../index.js";

describe("read model indexing config exports", () => {
  it("reaches the opt-out from the package entry point", () => {
    expect(BaseReadModel).toBeTypeOf("function");
    expect(unchunkedReadModelIndexingConfig.commitChunkSize).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("reaches the chunked default and its constants from the package entry point", () => {
    expect(DEFAULT_COMMIT_CHUNK_SIZE).toBe(50);
    expect(DEFAULT_READ_MODEL_YIELD_DEADLINE_MS).toBe(50);
    expect(defaultReadModelIndexingConfig).toEqual({
      commitChunkSize: DEFAULT_COMMIT_CHUNK_SIZE,
      yieldDeadlineMs: DEFAULT_READ_MODEL_YIELD_DEADLINE_MS,
    });
  });

  it("lets an out-of-package subclass type its own indexing choice", () => {
    const indexing: ReadModelIndexingConfig = unchunkedReadModelIndexingConfig;
    const config: BaseReadModelConfig = {
      readModelId: "external-read-model",
      rebuildStateOnInit: false,
      indexing,
    };

    expect(config.indexing).toBe(unchunkedReadModelIndexingConfig);
  });
});
