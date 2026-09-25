import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { createReactorMcpProvider } from "@powerhousedao/reactor-mcp";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  withSignaturePolicy,
  type AuthSubject,
  type DocumentModelModule,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";

const READER = "0xreader";
const OUTSIDER = "0xoutsider";

type Client = InProcessReactorClientModule["client"];

describe("MCP tools read as the caller under auth-scope policies", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build() {
    module = await new ReactorClientBuilder()
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

  const tools = async (client: Client, subject: AuthSubject) =>
    (await createReactorMcpProvider({ client, subject })).tools;

  const anonymous: AuthSubject = {};
  const outsider: AuthSubject = { address: OUTSIDER };
  const reader: AuthSubject = { address: READER };

  it("getDocument strips the domain scopes a caller may not read", async () => {
    const { client, secret } = await fixture();
    const read = async (subject: AuthSubject) => {
      const result = await (
        await tools(client, subject)
      ).getDocument.callback({ id: secret });
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
      ).getDocuments.callback({ parentId: drive });
      return (
        result.structuredContent as { documentIds: string[] }
      ).documentIds.sort();
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
      ).getDrives.callback({});
      return (result.structuredContent as { driveIds: string[] }).driveIds;
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
      ).getDrive.callback({
        driveId: policedDrive,
      });
      return (result.structuredContent as { drive: PHDocument }).drive;
    };

    expect((await read(anonymous)).state).not.toHaveProperty("global");
    expect((await read(outsider)).state).not.toHaveProperty("global");
    expect((await read(reader)).state).toHaveProperty("global");
  });
});
