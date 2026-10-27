import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  addModule,
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

describe("an execute batch stamped out of order, delivered split", () => {
  let author: InProcessReactorModule | undefined;
  let receiver: InProcessReactorModule | undefined;

  afterEach(() => {
    author?.reactor.kill();
    receiver?.reactor.kill();
    author = undefined;
    receiver = undefined;
  });

  function build(documentDecisions: boolean): Promise<InProcessReactorModule> {
    return new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({ featureFlags: { documentDecisions } })
      .buildModule();
  }

  async function run(
    module: InProcessReactorModule,
    job: Promise<JobInfo>,
  ): Promise<void> {
    const deadline = Date.now() + 10_000;
    const { id } = await job;
    let status = await module.reactor.getJobStatus(id);
    while (
      status.status !== JobStatus.READ_READY &&
      status.status !== JobStatus.FAILED
    ) {
      if (Date.now() > deadline) {
        throw new Error(`job ${id} did not settle: ${status.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      status = await module.reactor.getJobStatus(id);
    }
    expect(status.error?.message ?? status.status).toBe(JobStatus.READ_READY);
  }

  async function stored(
    module: InProcessReactorModule,
    docId: string,
    scope: string,
  ): Promise<Operation[]> {
    const result = (await module.reactor.getOperations(docId, {
      branch: "main",
      scopes: [scope],
    })) as Record<string, { results: Operation[] } | undefined>;
    return result[scope]?.results ?? [];
  }

  async function live(
    module: InProcessReactorModule,
    docId: string,
  ): Promise<string[]> {
    return garbageCollect(
      sortOperations(await stored(module, docId, "global")),
    ).map((operation) => (operation.action.input as { id: string }).id);
  }

  it.each([false, true])(
    "converges with documentDecisions %s",
    async (documentDecisions) => {
      author = await build(documentDecisions);
      receiver = await build(documentDecisions);
      const document = createDocModelDocument({ signaturePolicy: "legacy" });
      const docId = document.header.id;
      await run(author, author.reactor.create(document));
      await run(
        receiver,
        receiver.reactor.load(
          docId,
          "main",
          await stored(author, docId, "document"),
        ),
      );

      const base = Date.now() + 60_000;
      const stamped = (id: string, offsetMs: number): Action => ({
        ...addModule({ id, name: id }),
        timestampUtcMs: new Date(base + offsetMs).toISOString(),
      });
      await run(
        author,
        author.reactor.execute(docId, "main", [
          stamped("a", 100),
          stamped("b", 90),
        ]),
      );

      for (const operation of await stored(author, docId, "global")) {
        await run(receiver, receiver.reactor.load(docId, "main", [operation]));
      }
      const fromReceiver = await stored(receiver, docId, "global");
      await run(author, author.reactor.load(docId, "main", fromReceiver));
      const fromAuthor = await stored(author, docId, "global");
      await run(receiver, receiver.reactor.load(docId, "main", fromAuthor));

      expect(await live(receiver, docId)).toEqual(await live(author, docId));
    },
  );
});
