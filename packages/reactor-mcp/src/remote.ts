/**
 * reactor-mcp's tools over a reactor reached remotely, run in the caller's
 * process: a client that talks to a switchboard (reactor-browser's
 * `GraphQLReactorClient`) and signs, and bears, as the caller's own session,
 * so the caller's writes are its own and not the host's. There is no subject
 * and no host ACL here: the switchboard's door decides from the bearer.
 * Host-only tools (codegen status, remote drives) stay on the host's `/mcp`.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  IReactorClient,
  IReactorWriteClient,
  PagingOptions,
  WriteHandle,
} from "@powerhousedao/reactor";
import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { ReactorGroupV1 } from "@powerhousedao/reactor-group";
import {
  addFile,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import fs from "node:fs";
import path from "node:path";
import { ReactorMcpInstructions } from "./server.js";
import {
  reactorTools,
  toMcpTool,
  type ReactorToolClient,
} from "./tools/index.js";

/** What the remote tools need of a client: reactor-browser's GraphQL client has it. */
export type RemoteReactorClient = Pick<
  IReactorClient,
  | "get"
  | "find"
  | "getOperations"
  | "getOutgoingRelationships"
  | "getIncomingRelationships"
  | "getOutgoingRelationshipEdges"
  | "getIncomingRelationshipEdges"
  | "newDocument"
> & {
  readonly write: Pick<
    IReactorWriteClient,
    "create" | "execute" | "deleteDocument" | "addRelationship"
  >;
};

export interface RemoteToolClientOptions {
  /** The models the tools build, check and sign actions with; read per call. */
  documentModels: () => readonly DocumentModelModule[];
  /** A tool asked for a model this process does not hold. */
  onMissingModel?: (documentType: string) => void;
  /** A tool is about to write. */
  onWrite?: () => void;
}

/** The models every host has: document models, drives, reactor drives, groups. */
export const baseDocumentModels: readonly DocumentModelModule[] = [
  documentModelDocumentModelModule as unknown as DocumentModelModule,
  driveDocumentModelModule as unknown as DocumentModelModule,
  reactorDriveDocumentModelModule as unknown as DocumentModelModule,
  ReactorGroupV1 as unknown as DocumentModelModule,
];

function versionOf(module: DocumentModelModule): number {
  return module.version ?? 1;
}

function documentVersionOf(document: PHDocument): number {
  const version = (document.state as { document?: { version?: unknown } })
    .document?.version;
  return typeof version === "number" && version > 0 ? version : 1;
}

/**
 * The tool client over `client`: reads pass through, models come from
 * `documentModels`, and a document filed in a drive is created, filed and
 * related in three signed writes, since the switchboard's own create under a
 * drive would sign them itself.
 */
export function remoteToolClient(
  client: RemoteReactorClient,
  options: RemoteToolClientOptions,
): ReactorToolClient {
  const modelsOf = (documentType: string) =>
    options
      .documentModels()
      .filter((m) => m.documentModel.global.id === documentType);
  const missing = (documentType: string, message: string): never => {
    options.onMissingModel?.(documentType);
    throw new Error(message);
  };
  const latest = (documentType: string): DocumentModelModule => {
    const found = modelsOf(documentType).sort(
      (a, b) => versionOf(b) - versionOf(a),
    )[0];
    return (
      found ?? missing(documentType, `Unknown document type: ${documentType}`)
    );
  };
  const write = client.write;
  const writing = <T>(fn: () => T): T => {
    options.onWrite?.();
    return fn();
  };
  return {
    get: (id, view, signal, token) => client.get(id, view, signal, token),
    resolveIdOrSlug: async (id, view, signal, token) =>
      (await client.get(id, view, signal, token)).header.id,
    find: (search, view, paging, signal, token) =>
      client.find(search, view, paging, signal, token),
    getOperations: (id, view, filter, paging, signal) =>
      client.getOperations(id, view, filter, paging, signal),
    getOutgoingRelationships: (...args) =>
      client.getOutgoingRelationships(...args),
    getIncomingRelationships: (...args) =>
      client.getIncomingRelationships(...args),
    getOutgoingRelationshipEdges: (...args) =>
      client.getOutgoingRelationshipEdges(...args),
    getIncomingRelationshipEdges: (...args) =>
      client.getIncomingRelationshipEdges(...args),
    getDocumentModelModules: (namespace?: string, paging?: PagingOptions) => {
      const results = options
        .documentModels()
        .filter(
          (m) =>
            !namespace || m.documentModel.global.id.split("/")[0] === namespace,
        );
      return Promise.resolve({
        results: [...results],
        options: paging ?? { cursor: "0", limit: results.length },
      });
    },
    getDocumentModelModule: (documentType) =>
      Promise.resolve().then(() => latest(documentType)),
    getDocumentModelModuleForDocument: (document) =>
      Promise.resolve().then(() => {
        const type = document.header.documentType;
        const version = documentVersionOf(document);
        return (
          modelsOf(type).find((m) => versionOf(m) === version) ??
          missing(type, `Unknown document model version: ${type} v${version}`)
        );
      }),
    newDocument: (documentType, newOptions, signal) => {
      latest(documentType);
      return client.newDocument(documentType, newOptions, signal);
    },
    write: {
      create: (document, parent, signal) =>
        writing(() => write.create(document, parent, signal)),
      createEmpty: async (documentType, newOptions, signal) => {
        latest(documentType);
        const document = await client.newDocument(
          documentType,
          newOptions,
          signal,
        );
        return writing(() =>
          write.create(document, newOptions?.parentIdentifier, signal),
        );
      },
      execute: (id, branch, actions, signal) =>
        writing(() => write.execute(id, branch, actions, signal)),
      deleteDocument: (id, propagate, signal) =>
        writing(() => write.deleteDocument(id, propagate, signal)),
      drives: {
        addFile: (driveId, document, parentFolder, signal) =>
          writing(() =>
            fileInDrive(write, driveId, document, parentFolder, signal),
          ),
      },
    },
  };
}

/** What a drive's `addFile` does, each write signed by the caller. */
async function fileInDrive(
  write: RemoteReactorClient["write"],
  driveId: string,
  document: PHDocument,
  parentFolder: string | undefined,
  signal?: AbortSignal,
): Promise<WriteHandle> {
  const id = document.header.id;
  // The document first, so the drive never names a file whose create failed.
  await (
    await write.create(document, undefined, signal)
  ).readable;
  await (
    await write.execute(
      driveId,
      "main",
      [
        addFile({
          id,
          name: document.header.name || id,
          documentType: document.header.documentType,
          ...(parentFolder ? { parentFolder } : {}),
        }),
      ],
      signal,
    )
  ).readable;
  return write.addRelationship(driveId, id, "child", undefined, "main", signal);
}

export interface CreateRemoteServerOptions extends RemoteToolClientOptions {
  client: RemoteReactorClient;
}

/**
 * reactor-mcp's tools (reads, document create and delete, `addActions`) over
 * a remote client, as an MCP server for one process: no subject, no host
 * ACL, no codegen status. Multi-action `addActions` is signed by the client,
 * which predicts the chain with the document's own model.
 */
export function createRemoteServer(
  options: CreateRemoteServerOptions,
): McpServer {
  const server = new McpServer(
    {
      name: "reactor-mcp-server",
      version: "1.0.0",
      description: ReactorMcpInstructions,
    },
    { capabilities: { tools: {} } },
  );
  const ctx = { client: remoteToolClient(options.client, options) };
  for (const { name, callback, ...config } of reactorTools().map((tool) =>
    toMcpTool(tool, ctx),
  )) {
    // The records carry zod shapes the SDK accepts; its overloads cannot infer them.
    server.registerTool(name, config as never, callback as never);
  }
  return server;
}

/** The models of a project's `document-models` folder, kept current. */
export interface LocalDocumentModels {
  /** The base models and the project's, as last loaded. */
  current(): readonly DocumentModelModule[];
  close(): Promise<void>;
}

/**
 * The base models and those of `<root>/<documentModelsDir>`, loaded through
 * Vite as reactor-mcp's own stdio server loads them, and loaded again when a
 * file there changes. A project without the folder has the base models only,
 * and starts no Vite.
 */
export async function localDocumentModels(
  root: string,
  options: {
    documentModelsDir?: string;
    onError?: (error: unknown) => void;
  } = {},
): Promise<LocalDocumentModels> {
  const dir = options.documentModelsDir ?? "./document-models";
  let models: readonly DocumentModelModule[] = baseDocumentModels;
  if (!fs.existsSync(path.join(root, dir))) {
    return { current: () => models, close: () => Promise.resolve() };
  }
  const { VitePackageLoader } = await import("./stdio/loader.js");
  const loader = new VitePackageLoader(root, dir);
  const keep = (loaded: DocumentModelModule[]) => {
    models = [...baseDocumentModels, ...loaded];
  };
  try {
    keep(await loader.load());
  } catch (error) {
    options.onError?.(error);
  }
  const unsubscribe = await loader.onDocumentModelsChange(keep);
  return {
    current: () => models,
    close: async () => {
      unsubscribe();
      await loader.close();
    },
  };
}
