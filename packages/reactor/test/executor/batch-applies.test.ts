import type { Action, Operation } from "@powerhousedao/shared/document-model";
import { initializeAuth } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  BENCH_WRITER_ADDRESS,
  buildGrants,
  MINIMAL_SHAPE,
} from "../../bench/fixtures/auth-policies.js";
import { createDocModelDocument } from "../factories.js";

const WRITER = {
  signer: {
    user: { address: BENCH_WRITER_ADDRESS, networkId: "1", chainId: 1 },
    app: { name: "batch-test", key: "batch-test" },
    signatures: [] as never[],
  },
};

function signed<A extends Action>(action: A): A {
  return { ...action, context: WRITER } as A;
}

/**
 * Batching changes how many transactions a job's operations arrive in. It must
 * not change the operations. These run the same job both ways and compare the
 * streams they leave behind, because a difference there is the failure mode
 * that matters and it is invisible from a job that merely succeeds.
 *
 * These would also pass if batching never engaged, so they are only half the
 * story; `batch-applies-count.test.ts` counts the transactions and is what
 * proves it did.
 */
describe("batched applies", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors) {
      reactor.kill();
    }
    reactors.length = 0;
  });

  async function build(batchApplies: boolean): Promise<IReactor> {
    const reactor = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({
        batchApplies,
        featureFlags: { documentDecisions: true, authEnforcement: true },
      })
      .build();
    reactors.push(reactor);
    return reactor;
  }

  async function settle(reactor: IReactor, jobId: string): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const status = await reactor.getJobStatus(jobId);
      if (status.status === JobStatus.FAILED) {
        throw new Error(status.error?.message ?? "job failed");
      }
      if (status.status === JobStatus.READ_READY) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`job ${jobId} did not settle`);
  }

  async function streamOf(
    reactor: IReactor,
    documentId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const result = (await reactor.getOperations(documentId, {
      branch: "main",
      scopes: ["global"],
    })) as Record<string, { results: Operation[] }>;
    return result.global.results
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((operation) => ({
        index: operation.index,
        skip: operation.skip,
        type: operation.action.type,
        input: operation.action.input,
        hash: operation.hash,
        denied: operation.deniedReason,
      }));
  }

  function actions(count: number): Action[] {
    const creators = documentModelDocumentModelModule.actions;
    const out: Action[] = [];
    for (let i = 0; i < count; i++) {
      out.push(
        signed(
          i % 2 === 0
            ? creators.setModelName({ name: `name-${i}` })
            : creators.setModelDescription({ description: `desc-${i}` }),
        ),
      );
    }
    return out;
  }

  async function runJob(
    batchApplies: boolean,
    count: number,
    policied: boolean,
  ): Promise<{
    stream: Array<Record<string, unknown>>;
    state: unknown;
    revision: number | undefined;
  }> {
    const reactor = await build(batchApplies);
    const document = createDocModelDocument({
      id: `batch-${count}-${policied}`,
    });
    await settle(reactor, (await reactor.create(document)).id);

    if (policied) {
      await settle(
        reactor,
        (
          await reactor.execute(document.header.id, "main", [
            signed(
              initializeAuth({
                version: 1,
                grants: buildGrants({ ...MINIMAL_SHAPE, grantCount: 10 }),
              }),
            ),
          ])
        ).id,
      );
    }

    await settle(
      reactor,
      (await reactor.execute(document.header.id, "main", actions(count))).id,
    );

    const stream = await streamOf(reactor, document.header.id);
    const stored = await reactor.get(document.header.id, { branch: "main" });
    return {
      stream,
      state: (stored.state as Record<string, unknown>).global,
      revision: stored.header.revision.global,
    };
  }

  it("leaves the same operation stream as writing one at a time", async () => {
    const unbatched = await runJob(false, 12, true);
    const batched = await runJob(true, 12, true);

    expect(batched.stream).toEqual(unbatched.stream);
    expect(batched.state).toEqual(unbatched.state);
    expect(batched.revision).toBe(unbatched.revision);
    expect(batched.stream).toHaveLength(12);
  });

  it("agrees on an unpoliced document too", async () => {
    const unbatched = await runJob(false, 8, false);
    const batched = await runJob(true, 8, false);

    expect(batched.stream).toEqual(unbatched.stream);
    expect(batched.state).toEqual(unbatched.state);
  });

  it("agrees on a single-action job, which is never batched", async () => {
    const unbatched = await runJob(false, 1, true);
    const batched = await runJob(true, 1, true);

    expect(batched.stream).toEqual(unbatched.stream);
    expect(batched.stream).toHaveLength(1);
  });

  it("chains hashes across the batch, so each operation follows the last", async () => {
    const batched = await runJob(true, 6, true);
    const hashes = batched.stream.map((operation) => operation.hash);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(batched.stream.map((operation) => operation.index)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });
});
