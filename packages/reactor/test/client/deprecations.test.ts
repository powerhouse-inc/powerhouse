import type { ILogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetDeprecationWarnings,
  warnOnce,
} from "../../src/client/deprecations.js";
import { ReactorClient } from "../../src/client/reactor-client.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  createEmptyConsistencyToken,
  createMockDocumentIndexer,
  createMockDocumentView,
  createMockJobAwaiter,
  createMockLogger,
  createMockSigner,
  createMockSubscriptionManager,
} from "../factories.js";

type WarnSpy = (message: string, ...replacements: unknown[]) => void;

function spyLogger(): ILogger & { warn: ReturnType<typeof vi.fn<WarnSpy>> } {
  return { ...createMockLogger(), warn: vi.fn<WarnSpy>() };
}

describe("warnOnce", () => {
  beforeEach(() => {
    resetDeprecationWarnings();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("warns once per name, naming the replacement", () => {
    const logger = spyLogger();

    warnOnce("IReactorClient.execute", "Use write.execute.", logger);
    warnOnce("IReactorClient.execute", "Use write.execute.", logger);
    warnOnce("IReactorClient.create", "Use write.create.", logger);

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      "@name is deprecated. @hint",
      "IReactorClient.execute",
      "Use write.execute.",
    );
  });

  it("stays silent while PH_SILENCE_DEPRECATIONS is set", () => {
    const logger = spyLogger();
    vi.stubEnv("PH_SILENCE_DEPRECATIONS", "1");

    warnOnce("IReactorClient.rename", "Use write.rename.", logger);

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("still warns where there is no process, as in a browser", () => {
    const logger = spyLogger();
    vi.stubGlobal("process", undefined);
    warnOnce(
      "IReactorClient.deleteDocument",
      "Use write.deleteDocument.",
      logger,
    );
    vi.unstubAllGlobals();

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("ReactorClient deprecated writes", () => {
  beforeEach(() => {
    resetDeprecationWarnings();
  });

  it("warns once per method per process through the client's logger", async () => {
    const logger = spyLogger();
    const job = {
      id: "job-1",
      documentId: "doc-1",
      status: JobStatus.PENDING,
      createdAtUtcIso: new Date().toISOString(),
      consistencyToken: createEmptyConsistencyToken(),
      meta: { batchId: "test", batchJobIds: ["job-1"] },
    };
    const reactor = {
      execute: vi.fn().mockResolvedValue(job),
      getByIdOrSlug: vi.fn().mockResolvedValue({
        header: { id: "doc-1", documentType: "test" },
      }),
    } as unknown as IReactor;
    const documentView = createMockDocumentView();
    vi.mocked(documentView.resolveSlug).mockResolvedValue(undefined);
    const client = new ReactorClient(
      logger,
      reactor,
      createMockSigner(),
      createMockSubscriptionManager(),
      createMockJobAwaiter(),
      createMockDocumentIndexer(),
      documentView,
    );

    await client.execute("doc-1", "main", []);
    await client.execute("doc-1", "main", []);
    await client.executeAsync("doc-1", "main", []);
    await client.write.execute("doc-1", "main", []);

    const warnings = logger.warn.mock.calls.filter(
      (call) => call[0] === "@name is deprecated. @hint",
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0][1]).toBe("IReactorClient.execute");
    expect(warnings[0][2]).toContain("write.execute");
  });
});
