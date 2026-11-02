import type {
  Action,
  Grant,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  deriveOperationId,
  garbageCollect,
  setGrant,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import {
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { storedRows } from "./one-rule-agreement.js";

const modules: InProcessReactorModule[] = [];

afterEach(() => {
  for (const module of modules.splice(0)) {
    module.reactor.kill();
  }
});

async function settle(
  module: InProcessReactorModule,
  job: JobInfo,
): Promise<void> {
  let status = await module.reactor.getJobStatus(job.id);
  while (
    status.status !== JobStatus.READ_READY &&
    status.status !== JobStatus.FAILED
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    status = await module.reactor.getJobStatus(job.id);
  }
  expect(status.error?.message ?? status.status).toBe(JobStatus.READ_READY);
}

async function replica(document: PHDocument): Promise<InProcessReactorModule> {
  const module = await createUndoV3ReactorBuilder().buildModule();
  modules.push(module);
  await settle(module, await module.reactor.create(document));
  expect(
    (await module.reactor.get(document.header.id)).header.protocolVersions?.[
      "base-reducer"
    ],
  ).toBe(3);
  return module;
}

function grant(id: string, at: number): Action {
  const value: Grant = {
    id,
    description: id,
    effect: "allow",
    principal: { anyone: true },
    capability: { can: "execute", scope: "global" },
  };
  return {
    ...setGrant({ grant: value }),
    timestampUtcMs: new Date(at).toISOString(),
  };
}

function asOperation(documentId: string, action: Action, index: number) {
  return {
    id: deriveOperationId(documentId, action.scope, "main", action.id),
    index,
    skip: 0,
    hash: "",
    timestampUtcMs: action.timestampUtcMs,
    action,
  } satisfies Operation;
}

function grantIds(document: PHDocument): string[] {
  return (document.state.auth as { grants: Grant[] }).grants.map(
    (entry) => entry.id,
  );
}

describe("base-reducer 3 auth scope", () => {
  it("drops the row a reshuffle rewinds, as an in-order peer and the walk do", async () => {
    const document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    const documentId = document.header.id;
    const base = Date.now() + 60_000;
    const early = grant("b", base + 10);
    const late = grant("a", base + 20);

    const receiver = await replica(document);
    await settle(
      receiver,
      await receiver.reactor.execute(documentId, "main", [late]),
    );
    await settle(
      receiver,
      await receiver.reactor.load(documentId, "main", [
        asOperation(documentId, early, 0),
      ]),
    );

    const inOrder = await replica(document);
    await settle(
      inOrder,
      await inOrder.reactor.execute(documentId, "main", [early]),
    );
    await settle(
      inOrder,
      await inOrder.reactor.execute(documentId, "main", [late]),
    );

    const rows = await storedRows(receiver, documentId, "auth");
    expect(rows.map((row) => `${row.index}/${row.skip}`)).toEqual([
      "0/0",
      "1/1",
      "2/0",
    ]);
    const walked = garbageCollect(sortOperations([...rows])).map(
      (row) => (row.action.input as { grant: Grant }).grant.id,
    );

    const served = grantIds(await receiver.reactor.get(documentId));
    receiver.writeCache.invalidate(documentId);
    const rebuilt = grantIds(
      await receiver.writeCache.getState(documentId, "auth", "main"),
    );

    expect(grantIds(await inOrder.reactor.get(documentId))).toEqual(["b", "a"]);
    expect({ walked, served, rebuilt }).toEqual({
      walked: ["b", "a"],
      served: ["b", "a"],
      rebuilt: ["b", "a"],
    });
  });
});
