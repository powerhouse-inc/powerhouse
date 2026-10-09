import { JOB_NOT_FOUND_ERROR_NAME } from "@powerhousedao/reactor";
import { misrouteOf } from "@powerhousedao/reactor-router";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  actions,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { createGraphQLRoutableBackend } from "../../src/store/graphql-routable-backend.js";
import {
  data,
  DRIVE_TYPE,
  driveIdOf,
  REMOTE_INFO,
  serve,
  settledJob,
  switchboard,
  wrongShard,
  type StubSwitchboard,
} from "./switchboard-stub.js";

const MODEL_TYPE = "powerhouse/document-model";

let stub: StubSwitchboard | undefined;

afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

async function backendOver(
  documents: Record<string, string>,
  override?: Parameters<typeof switchboard>[1],
) {
  stub = await serve(switchboard(documents, override));
  return {
    stub,
    ...createGraphQLRoutableBackend({ url: stub.url, realtime: false }),
  };
}

const modelDocument = (id: string) =>
  withSignaturePolicy(
    documentModelDocumentModelModule.utils.createDocument(),
    "legacy",
    { id },
  );

const driveDocument = (id: string) =>
  withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id },
  );

describe("createGraphQLRoutableBackend declares what GraphQL serves", () => {
  it("is a plain object without the members GraphQL cannot serve", async () => {
    const { backend } = await backendOver({});

    expect(Object.getPrototypeOf(backend)).toBe(Object.prototype);
    for (const member of [
      "submit",
      "isDocumentIdTaken",
      "resolveIdOrSlug",
      "evaluateActions",
      "loadBatch",
      "addRelationship",
      "updateRelationship",
      "removeRelationship",
      "moveRelationship",
      "getDocumentModelModules",
      "getDocumentModelModule",
    ]) {
      expect(backend, member).not.toHaveProperty(member);
    }
    expect(backend.supports.pointInTimeViews).toBe(false);
    expect(backend.supports.find({ type: DRIVE_TYPE })).toBe(true);
    expect(backend.supports.find({ ids: ["a"] })).toBe(false);
    expect(backend.supports.find({ type: DRIVE_TYPE }, { revision: 1 })).toBe(
      false,
    );
  });

  it("answers isServed from documentServed", async () => {
    const { backend, stub } = await backendOver({ "drive-1": DRIVE_TYPE });

    expect(await backend.isServed("drive-1")).toBe(true);
    expect(await backend.isServed("drive-2")).toBe(false);
    expect(stub.received.map((r) => r.body.operationName)).toEqual([
      "GetDocumentServed",
      "GetDocumentServed",
    ]);
  });

  it("reads the create defaults from createDefaults", async () => {
    const { backend, stub } = await backendOver({}, ({ body }) =>
      body.operationName === "GetCreateDefaults"
        ? data({
            createDefaults: {
              signaturePolicy: "legacy",
              protocolVersions: { "base-reducer": 2 },
            },
          })
        : undefined,
    );

    expect(await backend.getCreateSignaturePolicy()).toBe("legacy");
    expect(await backend.getCreateProtocolVersions("drive-1")).toEqual({
      "base-reducer": 2,
    });
    expect(stub.received.map((r) => r.body.variables)).toEqual([
      {},
      { parentIdOrSlug: "drive-1" },
    ]);
  });

  it("reads the Switchboard's facts from its inspection subgraph", async () => {
    const remote = await backendOver({});

    expect(await remote.info()).toEqual({
      ...REMOTE_INFO,
      access: { admin: false, sql: false },
    });
  });
});

describe("createGraphQLRoutableBackend getJob", () => {
  it("answers a known job", async () => {
    const { backend } = await backendOver({}, ({ body }) =>
      body.operationName === "GetJobStatus"
        ? data({ jobStatus: settledJob("doc-1") })
        : undefined,
    );

    expect(await backend.getJob("job-doc-1")).toMatchObject({
      id: "job-doc-1",
      documentId: "doc-1",
      status: "READ_READY",
    });
  });

  it("answers undefined for the server's unknown-job reply", async () => {
    const { backend } = await backendOver({}, ({ body }) =>
      body.operationName === "GetJobStatus"
        ? data({
            jobStatus: {
              ...settledJob(""),
              status: "FAILED",
              error: "Job not found",
              errorName: JOB_NOT_FOUND_ERROR_NAME,
            },
          })
        : undefined,
    );

    expect(await backend.getJob("job-x")).toBeUndefined();
  });

  it("answers undefined when the server reports no job", async () => {
    const { backend } = await backendOver({}, ({ body }) =>
      body.operationName === "GetJobStatus"
        ? data({ jobStatus: null })
        : undefined,
    );

    expect(await backend.getJob("job-x")).toBeUndefined();
  });
});

describe("createGraphQLRoutableBackend Drive-Id", () => {
  it("names a parent it has read as a drive on a create under it", async () => {
    const { backend, stub } = await backendOver({ "drive-1": DRIVE_TYPE });

    await backend.get("drive-1");
    await backend.create(modelDocument("doc-new"), "drive-1");

    expect(driveIdOf(stub.received, "CreateDocument")).toBe("drive-1");
  });

  it("names nothing for a parent it never saw as a drive", async () => {
    const { backend, stub } = await backendOver({
      "drive-1": DRIVE_TYPE,
      "doc-1": MODEL_TYPE,
    });

    await backend.get("doc-1");
    await backend.create(modelDocument("doc-new"), "drive-1");
    await backend.create(driveDocument("drive-nested"), "drive-1");
    await backend.create(modelDocument("doc-other"), "doc-1");

    for (const entry of stub.received) {
      expect(entry.headers["drive-id"], entry.body.operationName).toBe(
        undefined,
      );
    }
  });

  it("does not name a drive created under a parent by its own id", async () => {
    const { backend, stub } = await backendOver({ "drive-1": DRIVE_TYPE });

    await backend.get("drive-1");
    await backend.create(driveDocument("drive-nested"), "drive-1");

    expect(driveIdOf(stub.received, "CreateDocument")).toBe("drive-1");
  });

  it("names the drive a batch writes to", async () => {
    const { backend, stub } = await backendOver({
      "drive-1": DRIVE_TYPE,
      "doc-1": MODEL_TYPE,
    });

    await backend.find({ type: DRIVE_TYPE });
    await backend.executeBatch({
      jobs: [
        {
          key: "doc",
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          actions: [actions.setName("renamed")],
          dependsOn: [],
        },
        {
          key: "drive",
          documentId: "drive-1",
          scope: "global",
          branch: "main",
          actions: [actions.setName("renamed")],
          dependsOn: ["doc"],
        },
      ],
    });

    expect(driveIdOf(stub.received, "ExecuteBatch")).toBe("drive-1");
  });

  it("surfaces the 421 refusal as a misroute the router recognises", async () => {
    const { backend } = await backendOver(
      { "drive-1": DRIVE_TYPE },
      ({ body, headers }) =>
        body.operationName === "MutateDocumentWithOperations" &&
        headers["drive-id"] === "drive-1"
          ? wrongShard("drive-1")
          : undefined,
    );

    const write = backend.execute("drive-1", "main", [
      actions.setName("renamed"),
    ]);

    const error = await write.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(misrouteOf(error)).toMatchObject({
      misrouted: true,
      documentId: "drive-1",
    });
  });
});
