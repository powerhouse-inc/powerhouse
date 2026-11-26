import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type ISigner,
  type Signature,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphQLOperationNotSupportedError } from "../../src/graphql-client/errors.js";
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

  it("adds the parent's relationship, signed for the parent, in the one job the Switchboard takes for a create", async () => {
    const { url, received } = await serveStore({ "doc-new": MODEL_TYPE });
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({ url, signer, realtime: false });

    await client.create(modelDocument("doc-new"), "doc-1");

    const jobs = batchJobs(received);
    expect(jobs.map((job) => [job.key, job.documentIdOrSlug])).toEqual([
      ["create", "doc-new"],
    ]);
    expect(jobs[0]!.actions.map((action) => action.type)).toEqual([
      "CREATE_DOCUMENT",
      "UPGRADE_DOCUMENT",
      "ADD_RELATIONSHIP",
    ]);
    expect(signAction.mock.calls.at(-1)![1]).toEqual({
      documentId: "doc-1",
      branch: "main",
    });
  });

  it("files a create under a document drive itself: the create with the drive's link, then the drive's ADD_FILE", async () => {
    const { url, received } = await serveStore({ "doc-new": MODEL_TYPE });
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({ url, signer, realtime: false });

    await client.create(modelDocument("doc-new"), "drive-1");

    expect(sent(received, "CreateDocument")).toHaveLength(0);
    const [job] = batchJobs(received);
    expect(job!.documentIdOrSlug).toBe("doc-new");
    expect(job!.actions.map((action) => action.type)).toEqual([
      "CREATE_DOCUMENT",
      "UPGRADE_DOCUMENT",
      "ADD_RELATIONSHIP",
    ]);
    expect(sent(received, "ExecuteBatch")[0]!.headers["drive-id"]).toBe(
      "drive-1",
    );
    const [filed] = sent(received, "MutateDocumentAsync");
    const variables = filed!.body.variables as {
      documentIdOrSlug: string;
      actions: { type: string; input: Record<string, unknown> }[];
    };
    expect(variables.documentIdOrSlug).toBe("drive-1");
    expect(variables.actions).toMatchObject([
      {
        type: "ADD_FILE",
        input: { id: "doc-new", documentType: MODEL_TYPE },
      },
    ]);
    // Every action is the client's: three for the document, one for the drive.
    expect(signAction).toHaveBeenCalledTimes(4);
    expect(signAction.mock.calls.at(-1)![1]).toEqual({
      documentId: "drive-1",
      branch: "main",
    });
  });

  it("files a create under a reactor drive by its drive/child link, which names the file", async () => {
    const { url, received } = await serveStore({
      "doc-new": MODEL_TYPE,
      "rdrive-1": "powerhouse/reactor-drive",
    });
    const { signer } = testSigner();
    const client = new GraphQLReactorClient({ url, signer, realtime: false });

    await client.create(modelDocument("doc-new"), "rdrive-1");

    const [job] = batchJobs(received);
    const link = job!.actions.at(-1) as unknown as {
      type: string;
      input: Record<string, unknown>;
    };
    expect(link).toMatchObject({
      type: "ADD_RELATIONSHIP",
      input: {
        sourceId: "rdrive-1",
        targetId: "doc-new",
        relationshipType: "drive/child",
        metadata: {
          kind: "file",
          parentFolderId: null,
          documentType: MODEL_TYPE,
        },
      },
    });
    expect(sent(received, "MutateDocumentAsync")).toHaveLength(0);
    expect(sent(received, "CreateDocument")).toHaveLength(0);
  });

  it("files a document under a drive's folder through drives.addFile", async () => {
    const { url, received } = await serveStore({ "doc-new": MODEL_TYPE });
    const { signer } = testSigner();
    const client = new GraphQLReactorClient({ url, signer, realtime: false });

    const handle = await client.write.drives.addFile(
      "drive-1",
      modelDocument("doc-new"),
      "folder-1",
    );

    expect(handle.documentId).toBe("doc-new");
    const variables = sent(received, "MutateDocumentAsync")[0]!.body
      .variables as { actions: { input: Record<string, unknown> }[] };
    expect(variables.actions[0]!.input).toMatchObject({
      id: "doc-new",
      parentFolder: "folder-1",
    });
  });

  it("leaves a create under a parent the Switchboard does not find to its createDocument", async () => {
    const { url, received } = await serveStore({});
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({ url, signer, realtime: false });

    await client.create(modelDocument("doc-new"), "gone");

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

describe("a delete with a signer", () => {
  it("signs the document's DELETE_DOCUMENT itself and sends it as signedDelete", async () => {
    const { url, received } = await serveStore({});
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({ url, signer, realtime: false });

    await client.deleteDocument("doc-1");

    expect(sent(received, "DeleteDocument")).toHaveLength(0);
    const [request] = sent(received, "DeleteDocumentSigned");
    const variables = request!.body.variables as {
      idOrSlug: string;
      signedDelete: {
        type: string;
        input: unknown;
        context?: { signer?: { app?: { key: string } } };
      };
    };
    expect(variables.idOrSlug).toBe("doc-1");
    expect(variables.signedDelete).toMatchObject({
      type: "DELETE_DOCUMENT",
      input: { documentId: "doc-1" },
      context: { signer: { app: { key: "did:key:caller" } } },
    });
    expect(signAction).toHaveBeenCalledOnce();
    expect(signAction.mock.calls[0]![1]).toEqual({
      documentId: "doc-1",
      branch: "main",
    });
  });

  it("sends no unsigned delete to a Switchboard from before signedDelete", async () => {
    stub = await serve(
      switchboard({ "doc-1": MODEL_TYPE }, (received) =>
        received.body.operationName === "DeleteDocumentSigned"
          ? {
              status: 400,
              body: JSON.stringify({
                errors: [
                  {
                    message:
                      'Unknown argument "signedDelete" on field "Mutation.deleteDocument".',
                  },
                ],
              }),
            }
          : undefined,
      ),
    );
    const { signer } = testSigner();
    const client = new GraphQLReactorClient({
      url: stub.url,
      signer,
      realtime: false,
    });

    await expect(client.deleteDocument("doc-1")).rejects.toSatisfy(
      (error: unknown) => GraphQLOperationNotSupportedError.isError(error),
    );

    expect(sent(stub.received, "DeleteDocument")).toHaveLength(0);
  });

  it("deletes nothing it cannot find, sending no unsigned delete", async () => {
    stub = await serve(switchboard({}));
    const { signer } = testSigner();
    const client = new GraphQLReactorClient({
      url: stub.url,
      signer,
      realtime: false,
    });

    await expect(client.deleteDocument("missing")).rejects.toThrow(
      /serves no such document/,
    );

    expect(sent(stub.received, "DeleteDocument")).toHaveLength(0);
    expect(sent(stub.received, "DeleteDocumentSigned")).toHaveLength(0);
  });

  it("runs the Switchboard's own delete without a signer, as before", async () => {
    const { url, received } = await serveStore({});
    const client = new GraphQLReactorClient({
      url,
      signer: () => undefined,
      realtime: false,
    });

    await client.deleteDocument("doc-1");

    expect(sent(received, "DeleteDocument")).toHaveLength(1);
    expect(sent(received, "DeleteDocumentSigned")).toHaveLength(0);
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
