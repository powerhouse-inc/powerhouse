// @vitest-environment node
import type { IProcessorHostModule } from "@powerhousedao/reactor-browser";
import { ReactorBuilder } from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  generateId,
  withSignaturePolicy,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codegenFactoryBuilder } from "../factory.js";

// setupTests mocks the package for the editors; this needs a real reactor.
vi.unmock("@powerhousedao/reactor-browser");

const received = vi.hoisted(() => [] as string[]);

vi.mock("../processor.js", () => ({
  CodegenProcessor: vi.fn(function () {
    return {
      onOperations: (ops: OperationWithContext[]) => {
        for (const op of ops) received.push(op.operation.action.type);
        return Promise.resolve();
      },
      onDisconnect: () => Promise.resolve(),
    };
  }),
}));

type Module = Awaited<ReturnType<ReactorBuilder["buildModule"]>>;

async function settled(module: Module, jobId: string): Promise<void> {
  await vi.waitUntil(
    async () => {
      const status = String((await module.reactor.getJobStatus(jobId)).status);
      return status === "READ_READY" || status === "FAILED";
    },
    { timeout: 20_000, interval: 20 },
  );
  const { status } = await module.reactor.getJobStatus(jobId);
  expect(String(status)).toBe("READ_READY");
}

describe("codegen factory on a deleted Vetra drive", () => {
  let module: Module | undefined;

  afterEach(async () => {
    await module?.reactor.kill().completed;
    received.length = 0;
  });

  it("receives the deletion it was owed while unregistered", async () => {
    module = await new ReactorBuilder()
      .withDocumentModelSources([driveDocumentModelModule as never])
      .buildModule();
    const factory = await codegenFactoryBuilder({
      config: new Map<string, unknown>(),
    } as IProcessorHostModule);
    const manager = module.processorManager;
    await manager.registerFactory("vetra", factory);

    const drive = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
      { id: generateId() },
    );
    drive.header.slug = "vetra-owed";
    await settled(module, (await module.reactor.create(drive)).id);
    const driveId = drive.header.id;
    await vi.waitFor(() =>
      expect(manager.getAll().map((t) => t.driveId)).toContain(driveId),
    );

    await manager.unregisterFactory("vetra");
    await settled(module, (await module.reactor.deleteDocument(driveId)).id);
    await manager.registerFactory("vetra", factory);

    await vi.waitFor(() => expect(received).toContain("DELETE_DOCUMENT"));
  });
});
