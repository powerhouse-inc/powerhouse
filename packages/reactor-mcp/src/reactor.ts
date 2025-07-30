import {
  addFile,
  driveDocumentModelModule,
  isFileNode,
  ReactorBuilder,
  type IDocumentDriveServer,
} from "document-drive";
import { type IOperationResult } from "document-drive/server/types";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import {
  documentModelDocumentModelModule,
  type Action,
  type DocumentModelAction,
  type DocumentModelDocument,
  type DocumentModelModule,
  type DocumentModelState,
  type PHDocument,
} from "document-model";
import * as z from "document-model/document-model/gen/schema/zod";
import { validateDocumentModelAction } from "./utils.js";

const MCP_DRIVE_SLUG = "mcp";

export interface IReactorMcp {
  getDocument(id: string): Promise<PHDocument>;
  getDocuments(): Promise<string[]>;
  createDocument(
    documentType: string,
    name: string,
  ): Promise<{ id: string; document: PHDocument }>;
  addAction(documentId: string, action: Action): Promise<IOperationResult>;
}

export interface IDocumentModelMcp {
  getDocumentModel(name: string): Promise<DocumentModelState>;
  getDocumentModels(): Promise<Record<string, DocumentModelState>>;
  createDocumentModel(name: string): Promise<DocumentModelDocument>;
  addDocumentModelAction(
    name: string,
    action: DocumentModelAction,
  ): Promise<IOperationResult<DocumentModelDocument>>;
}

class ReactorMcp implements IReactorMcp {
  constructor(
    protected reactor: IDocumentDriveServer,
    // slug of the drive to store document models
    protected driveSlug: string = MCP_DRIVE_SLUG,
  ) {}

  async init() {
    try {
      const driveId = await this.reactor.getDriveIdBySlug(this.driveSlug);
      if (driveId) {
        return;
      }
    } catch {
      /* create drive */
    }

    await this.reactor.addDrive({
      slug: this.driveSlug,
      global: {
        name: "MCP",
      },
    });
  }

  protected getDocumentModelModule(documentType: string): DocumentModelModule {
    const documentModels = this.reactor.getDocumentModelModules();
    const documentModelModule = documentModels.find(
      (m) => m.documentModel.id === documentType,
    );
    if (!documentModelModule) {
      throw new Error(`Document model '${documentType}' not found`);
    }
    return documentModelModule;
  }

  async createDocument(
    documentType: string,
    name: string,
  ): Promise<{ id: string; document: PHDocument }> {
    const documentModelModule = this.getDocumentModelModule(documentType);
    const document = documentModelModule.utils.createDocument();
    document.header.name = name;
    const result = await this.reactor.addDocument(document);

    const driveId = await this.reactor.getDriveIdBySlug(this.driveSlug);
    const addResult = await this.reactor.addAction(
      driveId,
      addFile({
        id: result.header.id,
        documentType: document.header.documentType,
        name,
      }),
    );

    const opError = addResult.operations.at(-1)?.error;
    if (addResult.status !== "SUCCESS") {
      throw new Error(addResult.error?.message);
    } else if (opError) {
      throw new Error(opError);
    }

    return {
      id: result.header.id,
      document,
    };
  }

  getDocument(id: string): Promise<PHDocument> {
    return this.reactor.getDocument(id);
  }

  async getDocuments(): Promise<string[]> {
    const driveId = await this.reactor.getDriveIdBySlug(this.driveSlug);
    return this.reactor.getDocuments(driveId);
  }

  async addAction(
    documentId: string,
    action: Action,
  ): Promise<IOperationResult> {
    const document = await this.getDocument(documentId);
    const documentModelModule = this.getDocumentModelModule(
      document.header.documentType,
    );
    const result = validateDocumentModelAction(documentModelModule, action);
    if (!result.isValid) {
      throw new Error(result.errors.join(", "));
    }
    return this.reactor.addAction(documentId, action);
  }

  protected async getDocumentModelByName(
    name: string,
  ): Promise<DocumentModelDocument> {
    const drive = await this.reactor.getDriveBySlug(this.driveSlug);
    const id = drive.state.global.nodes.find(
      (n) =>
        n.name === name &&
        isFileNode(n) &&
        n.documentType === documentModelDocumentModelModule.documentModel.id,
    )?.id;
    if (!id) {
      throw new Error(`Document model ${name} not found`);
    }
    const document = await this.reactor.getDocument(id);

    z.DocumentModelStateSchema().parse(document.state.global);
    return document as DocumentModelDocument;
  }
}

export class DocumentModelMcp extends ReactorMcp implements IDocumentModelMcp {
  async getDocumentModel(name: string): Promise<DocumentModelState> {
    const document = await this.getDocumentModelByName(name);
    return document.state.global;
  }

  async getDocumentModels(): Promise<Record<string, DocumentModelState>> {
    const drive = await this.reactor.getDriveBySlug(this.driveSlug);
    const documents = drive.state.global.nodes.filter(
      (n) =>
        isFileNode(n) &&
        n.documentType === documentModelDocumentModelModule.documentModel.id,
    );
    const documentModels = await Promise.allSettled(
      documents.map((d) => this.getDocumentModelByName(d.name)),
    );
    return documentModels
      .filter((d) => d.status === "fulfilled")
      .map((d) => d.value)
      .reduce(
        (acc, documentModel) => {
          acc[documentModel.header.name] = documentModel.state.global;
          return acc;
        },
        {} as Record<string, DocumentModelState>,
      );
  }

  async createDocumentModel(name: string): Promise<DocumentModelDocument> {
    const result = await this.createDocument(
      documentModelDocumentModelModule.documentModel.id,
      name,
    );
    return result.document as DocumentModelDocument;
  }

  async addDocumentModelAction(
    name: string,
    action: DocumentModelAction,
  ): Promise<IOperationResult<DocumentModelDocument>> {
    const document = await this.getDocumentModelByName(name);
    return (await this.addAction(
      document.header.id,
      action,
    )) as IOperationResult<DocumentModelDocument>;
  }
}

async function createReactor() {
  const storage = new FilesystemStorage("./.ph/mcp/storage");
  const builder = new ReactorBuilder([
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule[]).withStorage(storage);

  const reactor = builder.build();
  await reactor.initialize();

  return reactor;
}

export async function initReactorMcp() {
  const reactor = await createReactor();
  const reactorMcp = new ReactorMcp(reactor);
  await reactorMcp.init();
  return reactorMcp;
}

export async function initDocumentModelMcp() {
  const reactor = await createReactor();
  const documentModelMcp = new DocumentModelMcp(reactor);
  await documentModelMcp.init();
  return documentModelMcp;
}
