import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import { positionalOperations } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { expect, vi } from "vitest";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { JobStatus, PropagationMode } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";
import { TRUST_ANY_SIGNER } from "../utils/signed-as.js";

// Positioning by timestamp, and so the tie, needs document decisions.
export const CASCADE_TIE_FLAGS: Partial<ReactorFeatureFlags> = {
  documentDecisions: true,
  authEnforcement: true,
};

async function settled(reactor: IReactor, jobId: string): Promise<void> {
  await vi.waitUntil(
    async () => {
      const status = await reactor.getJobStatus(jobId);
      if (status.status === JobStatus.FAILED) {
        throw new Error(status.error?.message ?? "job failed");
      }
      return status.status === JobStatus.READ_READY;
    },
    { timeout: 10_000 },
  );
}

async function documentOps(
  reactor: IReactor,
  documentId: string,
): Promise<Operation[]> {
  const page = await reactor.getOperations(documentId, {
    branch: "main",
    scopes: ["document"],
  });
  return page.document.results;
}

function labels(operations: Operation[]): string[] {
  return positionalOperations(operations).map((operation) => {
    const target = (operation.action.input as { targetId?: string }).targetId;
    return operation.action.type === "REMOVE_RELATIONSHIP"
      ? `${operation.action.type}:${target}`
      : operation.action.type;
  });
}

/** a -> b -> c cascade-deleted in one millisecond, then loaded onto a peer. */
export async function sameMillisecondCascade(
  client: IReactorClient,
  reactor: IReactor,
  prefix: string,
): Promise<void> {
  const [a, b, c] = ["a", "b", "c"].map((name) => `${prefix}-${name}`);
  await client.create(createDocModelDocument({ id: a }));
  await client.create(createDocModelDocument({ id: b }), a);
  await client.create(createDocModelDocument({ id: c }), b);

  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    await client.deleteDocument(a, PropagationMode.Cascade);
  } finally {
    vi.useRealTimers();
  }

  const cascade = (
    await Promise.all([a, b, c].map((id) => documentOps(reactor, id)))
  )
    .flat()
    .filter((operation) =>
      ["REMOVE_RELATIONSHIP", "DELETE_DOCUMENT"].includes(
        operation.action.type,
      ),
    );
  expect(
    new Set(cascade.map((operation) => operation.timestampUtcMs)).size,
  ).toBe(1);

  const other = await new ReactorBuilder()
    .withDocumentModelSources([
      documentModelDocumentModelModule as never,
      driveDocumentModelModule as never,
    ])
    .withExecutorConfig({ featureFlags: CASCADE_TIE_FLAGS })
    .withTrustPolicy(TRUST_ANY_SIGNER)
    .build();
  try {
    for (const id of [a, b, c]) {
      const load = await other.load(id, "main", await documentOps(reactor, id));
      await settled(other, load.id);
    }

    for (const [source, target] of [
      [a, b],
      [b, c],
    ]) {
      const here = labels(await documentOps(reactor, source));
      expect(here.slice(-2), `${source} removes before it deletes`).toEqual([
        `REMOVE_RELATIONSHIP:${target}`,
        "DELETE_DOCUMENT",
      ]);
      expect(labels(await documentOps(other, source)), source).toEqual(here);
    }
    expect(labels(await documentOps(other, c))).toEqual(
      labels(await documentOps(reactor, c)),
    );
  } finally {
    other.kill();
  }
}
