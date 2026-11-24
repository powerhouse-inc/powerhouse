import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type ISigner,
  type Signature,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import {
  DRIVE_TYPE,
  serve,
  switchboard,
  type Received,
  type StubSwitchboard,
} from "./switchboard-stub.js";

// With a signer, a create is built and signed by the client and sent through
// `executeBatch`: no action of it is the Switchboard's to sign.

const MODEL_TYPE = "powerhouse/document-model";

let stub: StubSwitchboard | undefined;
afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

const signature: Signature = [
  "1700000007",
  "did:key:caller",
  "v2:hash",
  "",
  "0xdeadbeef",
];

function testSigner() {
  const signAction = vi.fn().mockResolvedValue(signature);
  const signer = {
    user: { address: "0xcaller", networkId: "eip155", chainId: 1 },
    app: { name: "vetra", key: "did:key:caller" },
    signAction,
  } as unknown as ISigner;
  return { signer, signAction };
}

const modelDocument = (id: string) =>
  withSignaturePolicy(
    documentModelDocumentModelModule.utils.createDocument(),
    "legacy",
    { id },
  );

async function serveStore(documents: Record<string, string>) {
  stub = await serve(
    switchboard({
      "drive-1": DRIVE_TYPE,
      "doc-1": MODEL_TYPE,
      ...documents,
    }),
  );
  return stub;
}

const sent = (received: Received[], operationName: string) =>
  received.filter((r) => r.body.operationName === operationName);

type BatchJob = {
  key: string;
  documentIdOrSlug: string;
  dependsOn: string[];
  actions: {
    type: string;
    context?: { signer?: { app?: { key: string }; signatures: unknown[] } };
  }[];
};

const batchJobs = (received: Received[]) =>
  (
    sent(received, "ExecuteBatch")[0]?.body.variables as
      | { jobs: BatchJob[] }
      | undefined
  )?.jobs ?? [];

describe("a create with a signer", () => {
  it("signs CREATE_DOCUMENT and UPGRADE_DOCUMENT itself and sends them as a batch", async () => {
    const { url, received } = await serveStore({ "doc-new": MODEL_TYPE });
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({ url, signer, realtime: false });

    const created = await client.create(modelDocument("doc-new"));

    expect(created.header.id).toBe("doc-new");
    expect(sent(received, "CreateDocument")).toHaveLength(0);
    const [job] = batchJobs(received);
    expect(job).toMatchObject({ key: "create", documentIdOrSlug: "doc-new" });
    expect(job!.actions.map((action) => action.type)).toEqual([
      "CREATE_DOCUMENT",
      "UPGRADE_DOCUMENT",
    ]);
    for (const action of job!.actions) {
      expect(action.context?.signer?.app?.key).toBe("did:key:caller");
      expect(action.context?.signer?.signatures).toHaveLength(1);
    }
    expect(signAction).toHaveBeenCalledTimes(2);
    expect(signAction.mock.calls[0]![1]).toEqual({
      documentId: "doc-new",
      branch: "main",
    });
  });

  it("adds the parent's relationship, signed for the parent, after the create", async () => {
    const { url, received } = await serveStore({ "doc-new": MODEL_TYPE });
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({ url, signer, realtime: false });

    await client.create(modelDocument("doc-new"), "doc-1");

    const jobs = batchJobs(received);
    expect(jobs.map((job) => [job.key, job.documentIdOrSlug])).toEqual([
      ["create", "doc-new"],
      ["parent", "doc-1"],
    ]);
    expect(jobs[1]!.dependsOn).toEqual(["create"]);
    expect(jobs[1]!.actions.map((action) => action.type)).toEqual([
      "ADD_RELATIONSHIP",
    ]);
    expect(signAction.mock.calls.at(-1)![1]).toEqual({
      documentId: "doc-1",
      branch: "main",
    });
  });

  it("leaves a create under a drive to the Switchboard, which files it", async () => {
    const { url, received } = await serveStore({});
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({ url, signer, realtime: false });

    await client.create(modelDocument("doc-new"), "drive-1");

    expect(sent(received, "CreateDocument")).toHaveLength(1);
    expect(sent(received, "ExecuteBatch")).toHaveLength(0);
    expect(signAction).not.toHaveBeenCalled();
  });

  it("refuses a slug another document holds, and sends nothing", async () => {
    const { url, received } = await serveStore({});
    const { signer } = testSigner();
    const client = new GraphQLReactorClient({ url, signer, realtime: false });
    const document = modelDocument("doc-new");
    document.header.slug = "doc-1";

    await expect(client.create(document)).rejects.toThrow(
      /The slug "doc-1" is taken by document doc-1/,
    );
    expect(sent(received, "ExecuteBatch")).toHaveLength(0);
  });

  it("takes a signer that resolves asynchronously", async () => {
    const { url, received } = await serveStore({ "drive-new": DRIVE_TYPE });
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({
      url,
      signer: () => Promise.resolve(signer),
      realtime: false,
    });
    const drive = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
      { id: "drive-new" },
    );

    await client.create(drive);

    expect(signAction).toHaveBeenCalledTimes(2);
    // A new top-level drive names itself for the routing header.
    expect(sent(received, "ExecuteBatch")[0]!.headers["drive-id"]).toBe(
      "drive-new",
    );
  });
});

describe("a create without a signer", () => {
  it("runs the Switchboard's createDocument, as before", async () => {
    const { url, received } = await serveStore({});
    const client = new GraphQLReactorClient({
      url,
      signer: () => undefined,
      realtime: false,
    });

    await client.create(modelDocument("doc-new"));

    expect(sent(received, "CreateDocument")).toHaveLength(1);
    expect(sent(received, "ExecuteBatch")).toHaveLength(0);
  });
});
