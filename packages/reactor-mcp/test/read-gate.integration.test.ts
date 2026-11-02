import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  reactorAdminTools,
  reactorTools,
  SubjectScopedClient,
  toMcpTool,
} from "../src/index.js";
import {
  addFile,
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  withSignaturePolicy,
  type AuthSubject,
  type DocumentModelModule,
  type ISigner,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { createP256Signer } from "./utils/p256-signer.js";

const READER = "0xreader";
const OUTSIDER = "0xoutsider";

type Client = InProcessReactorClientModule["client"];

describe("MCP tools read as the caller under auth-scope policies", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build(signer?: ISigner) {
    const builder = new ReactorClientBuilder();
    if (signer) builder.withSigner(signer);
    module = await builder
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({
            featureFlags: { documentDecisions: true, authEnforcement: true },
          }),
      )
      .buildModule();
    return module.client;
  }

  async function create(
    client: Client,
    source: { utils: { createDocument: () => PHDocument } },
    id: string,
    parent?: string,
  ) {
    // A fixed id cannot be content-addressed, so the document is legacy.
    const document = withSignaturePolicy(
      source.utils.createDocument(),
      "legacy",
      { id },
    );
    document.header.name = id;
    await client.create(document, parent);
    return id;
  }

  async function police(client: Client, id: string) {
    await client.execute(id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-read",
            description: "the reader reads the domain",
            effect: "allow",
            principal: { address: READER },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "auth" },
          },
        ],
      }),
    ]);
  }

  async function fixture() {
    const client = await build();
    const drive = await create(client, driveDocumentModelModule, "mcp-drive");
    const secret = await create(
      client,
      documentModelDocumentModelModule,
      "mcp-secret",
      drive,
    );
    await police(client, secret);
    const open = await create(
      client,
      documentModelDocumentModelModule,
      "mcp-open",
      drive,
    );
    const policedDrive = await create(
      client,
      driveDocumentModelModule,
      "mcp-policed-drive",
    );
    await police(client, policedDrive);
    return { client, drive, secret, open, policedDrive };
  }

  const tools = (client: Client, subject: AuthSubject) => {
    const ctx = { client: new SubjectScopedClient(client, subject) };
    const byName = Object.fromEntries(
      reactorTools().map((tool) => [tool.name, toMcpTool(tool, ctx)]),
    );
    return Promise.resolve(byName);
  };

  const anonymous: AuthSubject = {};
  const outsider: AuthSubject = { address: OUTSIDER };
  const reader: AuthSubject = { address: READER };

  it("getDocument strips the domain scopes a caller may not read", async () => {
    const { client, secret } = await fixture();
    const read = async (subject: AuthSubject) => {
      const result = await (
        await tools(client, subject)
      ).getDocument.callback({ id: secret } as never);
      return (result.structuredContent as { document: PHDocument }).document;
    };

    expect((await read(anonymous)).state).not.toHaveProperty("global");
    expect((await read(outsider)).state).not.toHaveProperty("global");
    expect((await read(reader)).state).toHaveProperty("global");
  });

  it("getDocuments withholds the children a caller may not read", async () => {
    const { client, drive, secret, open } = await fixture();
    const list = async (subject: AuthSubject) => {
      const result = await (
        await tools(client, subject)
      ).getDocuments.callback({ parentId: drive } as never);
      return (
        result.structuredContent as { documents: { id: string }[] }
      ).documents
        .map((d) => d.id)
        .sort();
    };

    expect(await list(anonymous)).toEqual([open]);
    expect(await list(outsider)).toEqual([open]);
    expect(await list(reader)).toEqual([open, secret].sort());
  });

  it("getDrives withholds the drives a caller may not read", async () => {
    const { client, drive, policedDrive } = await fixture();
    const list = async (subject: AuthSubject) => {
      const result = await (
        await tools(client, subject)
      ).getDrives.callback({} as never);
      return (
        result.structuredContent as { drives: { id: string }[] }
      ).drives.map((d) => d.id);
    };

    expect(await list(anonymous)).toEqual([drive]);
    expect(await list(outsider)).toEqual([drive]);
    expect((await list(reader)).sort()).toEqual([drive, policedDrive].sort());
  });

  it("getDrive strips the domain scopes a caller may not read", async () => {
    const { client, policedDrive } = await fixture();
    const read = async (subject: AuthSubject) => {
      const result = await (
        await tools(client, subject)
      ).getDrive.callback({ driveId: policedDrive } as never);
      return (result.structuredContent as { drive: PHDocument }).drive;
    };

    expect((await read(anonymous)).state).not.toHaveProperty("global");
    expect((await read(outsider)).state).not.toHaveProperty("global");
    expect((await read(reader)).state).toHaveProperty("global");
  });
  it("addActions returns a write the policy denied as an error", async () => {
    const { client, drive, policedDrive } = await fixture();
    const { addActions } = await tools(client, reader);
    const addFolder = { type: "ADD_FOLDER", input: { id: "f", name: "f" } };

    const denied = await addActions.callback({
      documentId: policedDrive,
      actions: [addFolder],
    } as never);
    expect(denied.isError).toBeFalsy();
    expect(denied.structuredContent).toMatchObject({
      success: false,
      revision: (await client.get(policedDrive)).header.revision,
      results: [
        {
          index: 0,
          type: "ADD_FOLDER",
          error: { kind: "denied", message: expect.any(String) },
        },
      ],
    });

    const allowed = await addActions.callback({
      documentId: drive,
      actions: [addFolder],
    } as never);
    expect(allowed.structuredContent).toMatchObject({
      success: true,
      results: [{ index: 0, type: "ADD_FOLDER" }],
    });
  });

  it("addActions names the denied action of a refused batch", async () => {
    const client = await build();
    const drive = await create(client, driveDocumentModelModule, "mcp-folders");
    await client.execute(drive, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-add",
            description: "anyone adds folders",
            effect: "allow",
            principal: { anyone: true },
            capability: {
              can: "execute",
              scope: "global",
              operation: ["ADD_FOLDER"],
            },
          },
          {
            id: "g-read",
            description: "anyone reads",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "auth" },
          },
        ],
      }),
    ]);
    const { addActions } = await tools(client, anonymous);

    const result = await addActions.callback({
      documentId: drive,
      actions: [
        { type: "ADD_FOLDER", input: { id: "a", name: "a" } },
        { type: "DELETE_NODE", input: { id: "a" } },
        { type: "ADD_FOLDER", input: { id: "b", name: "b" } },
      ],
    } as never);

    expect(result.isError).toBeFalsy();
    const { success, results } = result.structuredContent as {
      success: boolean;
      results: { index: number; error?: { kind: string } }[];
    };
    expect(success).toBe(false);
    expect(results.map((r) => [r.index, r.error?.kind])).toEqual([
      [0, "not-applied"],
      [1, "denied"],
      [2, "not-applied"],
    ]);
    const read = await client.get<DocumentDriveDocument>(drive);
    expect(read.state.global.nodes).toEqual([]);
  });

  it("deleteDocument refuses a document filed in a drive the caller cannot read", async () => {
    const client = await build();
    const drive = await create(client, driveDocumentModelModule, "mcp-hidden");
    const filed = await create(
      client,
      documentModelDocumentModelModule,
      "mcp-filed",
      drive,
    );
    await client.execute(drive, "main", [
      addFile({
        id: filed,
        name: filed,
        documentType: "powerhouse/document-model",
      }),
    ]);
    await police(client, drive);

    const result = await (
      await tools(client, outsider)
    ).deleteDocument.callback({ documentId: filed } as never);

    expect(result._meta?.error).toMatchObject({ code: "FORBIDDEN" });
    await expect(client.get(filed)).resolves.toBeDefined();
    const read = await client.get<DocumentDriveDocument>(drive, {
      subject: reader,
    });
    expect(read.state.global.nodes.map((n) => n.id)).toEqual([filed]);
  });

  it("deleteDrive reads the drive as the caller", async () => {
    const { client, policedDrive } = await fixture();
    const deleteDrive = (subject: AuthSubject) => {
      const tool = reactorAdminTools({ subject }).find(
        (t) => t.name === "deleteDrive",
      )!;
      return toMcpTool(tool, { client }).callback({
        documentId: policedDrive,
      } as never);
    };

    const refused = await deleteDrive(outsider);
    expect(refused._meta?.error).toMatchObject({ code: "FORBIDDEN" });
    await expect(client.get(policedDrive)).resolves.toBeDefined();
  });

  it("deleteDocument refuses a document filed in a drive only the signer reads", async () => {
    const signer = await createP256Signer();
    const client = await build(signer);
    const drive = await create(client, driveDocumentModelModule, "mcp-hidden");
    const filed = await create(
      client,
      documentModelDocumentModelModule,
      "mcp-filed",
      drive,
    );
    await client.execute(drive, "main", [
      addFile({
        id: filed,
        name: filed,
        documentType: "powerhouse/document-model",
      }),
    ]);
    const principal = { address: signer.user!.address };
    await client.execute(drive, "main", [
      initializeAuth({
        version: 1,
        grants: ["read", "execute"].flatMap((can) =>
          ["global", "document", "auth"].map((scope) => ({
            id: `g-${can}-${scope}`,
            description: "the signer administers the drive",
            effect: "allow" as const,
            principal,
            capability: { can: can as "read" | "execute", scope },
          })),
        ),
      }),
    ]);

    const result = await (
      await tools(client, outsider)
    ).deleteDocument.callback({ documentId: filed } as never);

    expect(result._meta?.error).toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("which you cannot change"),
    });
    await expect(client.get(filed)).resolves.toBeDefined();
    const read = await client.get<DocumentDriveDocument>(drive);
    expect(read.state.global.nodes.map((n) => n.id)).toEqual([filed]);
  });
});
