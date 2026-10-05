import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  IReactorClient,
  InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import {
  createReactorMcpProvider,
  createServer,
  getDocumentModelSchemaTool,
} from "@powerhousedao/reactor-mcp";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
  inspectableDefinition,
} from "document-model";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  materializeLoaderPackage,
  type MaterializedPackage,
} from "../../document-model/test/fixtures/loaders/materialize.js";

const CODE_FIRST_TYPE = "test/ledger";
const MODEL_DOCUMENT_TYPE = "powerhouse/document-model";

let fixture: MaterializedPackage;
let ledgerModules: DocumentModelModule[];
let reactorModule: InProcessReactorClientModule;
let client: IReactorClient;

beforeAll(async () => {
  fixture = materializeLoaderPackage();
  const namespace = (await import(
    /* @vite-ignore */
    pathToFileURL(join(fixture.root, "document-models/index.ts")).href
  )) as { documentModels: DocumentModelModule[] };
  ledgerModules = namespace.documentModels;
});

afterAll(() => {
  fixture.dispose();
});

beforeEach(async () => {
  reactorModule = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
        ...ledgerModules,
      ]),
    )
    .buildModule();
  client = reactorModule.client;
});

afterEach(() => {
  reactorModule.reactor.kill();
});

describe("getDocumentModelSchema", () => {
  it("preserves schema responses through the registered MCP server", async () => {
    const server = await createServer({ client });
    const protocolClient = new Client({
      name: "reactor-mcp-test",
      version: "1",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await protocolClient.connect(clientTransport);
      const registered = await protocolClient.listTools();
      const schemaTool = registered.tools.find(
        (tool) => tool.name === "getDocumentModelSchema",
      );
      expect(schemaTool?.outputSchema?.properties).toHaveProperty("authoring");

      const legacy = await protocolClient.callTool({
        name: "getDocumentModelSchema",
        arguments: { type: MODEL_DOCUMENT_TYPE },
      });
      expect(legacy.isError).toBeUndefined();
      expect(legacy.structuredContent).toStrictEqual({
        schema: documentModelDocumentModelModule.documentModel.global,
      });

      const codeFirst = await protocolClient.callTool({
        name: "getDocumentModelSchema",
        arguments: { type: CODE_FIRST_TYPE },
      });
      expect(codeFirst.isError).toBeUndefined();
      const latest = ledgerModules.find((module) => module.version === 2)!;
      expect(codeFirst.structuredContent).toStrictEqual({
        schema: latest.documentModel.global,
        definition: inspectableDefinition(latest)?.definition,
        authoring: {
          mode: "code-first",
          writableThroughDocumentActions: false,
        },
      });
    } finally {
      await protocolClient.close();
      await server.close();
    }
  });

  it("keeps its schema response for a schema-first model", async () => {
    const provider = await createReactorMcpProvider({ client });
    const result = await provider.tools.getDocumentModelSchema.callback({
      type: MODEL_DOCUMENT_TYPE,
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toStrictEqual({
      schema: documentModelDocumentModelModule.documentModel.global,
    });
  });

  it("adds the definition and the authoring mode for a code-first model", async () => {
    const provider = await createReactorMcpProvider({ client });
    const result = await provider.tools.getDocumentModelSchema.callback({
      type: CODE_FIRST_TYPE,
    });
    expect(result.isError).toBeUndefined();
    const latest = ledgerModules.find((module) => module.version === 2)!;
    expect(result.structuredContent).toStrictEqual({
      schema: latest.documentModel.global,
      definition: inspectableDefinition(latest)?.definition,
      authoring: {
        mode: "code-first",
        writableThroughDocumentActions: false,
      },
    });
  });

  it("exposes no document id and no mutation resource", async () => {
    const provider = await createReactorMcpProvider({ client });
    const result = await provider.tools.getDocumentModelSchema.callback({
      type: CODE_FIRST_TYPE,
    });
    expect(result.isError).toBeUndefined();
    const content = result.structuredContent;
    expect(content).not.toHaveProperty("documentId");
    expect(content).not.toHaveProperty("id");
    expect(content).not.toHaveProperty("resource");
    const keys: string[] = [];
    const walk = (value: unknown): void => {
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        keys.push(key);
        walk(child);
      }
    };
    walk(content);
    expect(keys.filter((key) => key === "documentId")).toEqual([]);
    expect(Object.keys(provider.resources)).toEqual([]);
  });

  it("names the repository edit workflow in its help", () => {
    const description = getDocumentModelSchemaTool.description;
    expect(description).toMatch(/code-first/);
    expect(description).toMatch(/package repository/);
    expect(description).toMatch(/rebuild/i);
    expect(description).toMatch(/not through document actions/i);
  });
});

describe("addActions is unaffected", () => {
  it("still edits a schema-first model document", async () => {
    const document = documentModelCreateDocument();
    await client.create(document);
    const provider = await createReactorMcpProvider({ client });
    const result = await provider.tools.addActions.callback({
      documentId: document.header.id,
      actions: [
        documentModelDocumentModelModule.actions.setModelName({
          name: "still editable",
        }),
      ],
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toStrictEqual({ success: true });
    const updated = await client.get(document.header.id);
    expect(updated.state).toMatchObject({ global: { name: "still editable" } });
  });

  it("still edits a model document that declares a registered code-first id", async () => {
    const document = documentModelCreateDocument();
    await client.create(document);
    const provider = await createReactorMcpProvider({ client });

    const result = await provider.tools.addActions.callback({
      documentId: document.header.id,
      actions: [
        documentModelDocumentModelModule.actions.setModelId({
          id: CODE_FIRST_TYPE,
        }),
        documentModelDocumentModelModule.actions.setModelName({
          name: "Ledger",
        }),
      ],
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toStrictEqual({ success: true });

    const updated = await client.get(document.header.id);
    expect(updated.state).toMatchObject({
      global: { id: CODE_FIRST_TYPE, name: "Ledger" },
    });
    const inspection = await provider.tools.getDocumentModelSchema.callback({
      type: CODE_FIRST_TYPE,
    });
    expect(inspection.structuredContent).toMatchObject({
      authoring: {
        mode: "code-first",
        writableThroughDocumentActions: false,
      },
    });
  });

  it("still adds actions to a business document", async () => {
    const ledger = ledgerModules.find((module) => module.version === 2)!;
    const document = ledger.utils.createDocument();
    await client.create(document);
    const provider = await createReactorMcpProvider({ client });
    const result = await provider.tools.addActions.callback({
      documentId: document.header.id,
      actions: [
        {
          type: "ADD_AMOUNT",
          input: { amount: 5 },
          scope: "global",
        },
      ],
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toStrictEqual({ success: true });
    const updated = await client.get(document.header.id);
    expect(updated.state).toMatchObject({ global: { total: 5 } });
    const operations = await client.getOperations(document.header.id);
    expect(operations.results.at(-1)?.error).toBeUndefined();
  });
});
