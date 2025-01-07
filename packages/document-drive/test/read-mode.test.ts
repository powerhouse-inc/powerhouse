import * as BudgetStatement from "document-model-libs/budget-statement";
import * as DocumentDrive from "document-model-libs/document-drive";
import * as documentModelsMap from "document-model-libs/document-models";
import { Document, DocumentModel } from "document-model/document";
import { beforeEach, describe, it, vi } from "vitest";
import createFetchMock from "vitest-fetch-mock";
import { DocumentModelNotFoundError } from "../src";
import {
  ReadDocumentNotFoundError,
  ReadDrive,
  ReadDriveContext,
  ReadDriveNotFoundError,
  ReadDriveSlugNotFoundError,
} from "../src/read-mode";
import { ReadModeService } from "../src/read-mode/service";

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();

const documentModels = Object.values(documentModelsMap) as DocumentModel[];

function getDocumentModel(id: string) {
  const documentModel = documentModels.find((d) => d.documentModel.id === id);
  if (!documentModel) {
    throw new Error(`Document model not found for id: ${id}`);
  }
  return documentModel;
}

function buildDrive(state: Partial<DocumentDrive.DocumentDriveState>) {
  return DocumentDrive.utils.createDocument({
    state: DocumentDrive.utils.createState({
      global: state,
    }),
  });
}

function buildDocumentResponse(drive: Document) {
  return {
    ...drive,
    revision: drive.revision.global,
    state: drive.state.global,
    operations: drive.operations.global.map(({ input, ...op }) => ({
      ...op,
      inputText: JSON.stringify(input),
    })),
    initialState: drive.initialState.state.global,
  };
}

function mockAddDrive(url: string, drive: DocumentDrive.DocumentDriveDocument) {
  fetchMocker.mockIf(url, async (req) => {
    const { operationName } = (await req.json()) as {
      operationName: string;
    };

    return {
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        data:
          operationName === "getDrive"
            ? { drive: drive.state.global }
            : {
                document: buildDocumentResponse(drive),
              },
      }),
    };
  });
}

describe("Read mode methods", () => {
  beforeEach(() => {
    fetchMocker.resetMocks();
  });

  it("should return read drive when drive ID is found in read drives", async ({
    expect,
  }) => {
    const readModeService = new ReadModeService(getDocumentModel);
    const readDriveId = "read-drive";
    const context: ReadDriveContext = {
      url: `https://switchboard.com/d/${readDriveId}`,
      filter: {
        branch: ["*"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["*"],
      },
    };
    const driveData = {
      id: readDriveId,
      name: "Read drive",
      nodes: [],
      slug: "read-drive",
    };
    const drive = buildDrive(driveData);
    mockAddDrive(context.url, drive);

    await readModeService.addReadDrive(context.url, context);

    expect(fetchMocker).toHaveBeenCalledWith(context.url, {
      body: JSON.stringify({
        query: `
        query getDrive {
          drive {
            id
            name
            icon
            slug
          }
        }
      `,
        operationName: "getDrive",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    expect(fetchMocker).toHaveBeenCalledWith(context.url, {
      body: JSON.stringify({
        query: `
            query ($id: String!) {
                document(id: $id) {
                    id
                    name
                    created
                    documentType
                    lastModified
                    revision
                    operations {
                        id
                        error
                        hash
                        index
                        skip
                        timestamp
                        type
                        inputText
                        context {
                            signer {
                                user {
                                    address
                                    networkId
                                    chainId
                                }
                                app {
                                    name
                                    key
                                }
                                signatures
                            }
                        }
                    }
                    ... on DocumentDrive {
                        state {
                            id name nodes { ... on FolderNode { id name kind parentFolder } ... on FileNode { id name kind documentType parentFolder synchronizationUnits { syncId scope branch } } } icon slug
                        }
                        initialState {
                            id name nodes { ... on FolderNode { id name kind parentFolder } ... on FileNode { id name kind documentType parentFolder synchronizationUnits { syncId scope branch } } } icon slug
                        }
                    }
                }
            }
        `,
        variables: { id: readDriveId },
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const result = await readModeService.getReadDrive(readDriveId);
    expect(result).toStrictEqual({
      ...drive,
      initialState: {
        ...drive.initialState,
        lastModified: (result as ReadDrive).initialState.lastModified,
      },
      readContext: context,
    });

    const resultContext =
      await readModeService.getReadDriveContext(readDriveId);
    expect(resultContext).toStrictEqual(context);

    const readDrive = await readModeService.fetchDrive(readDriveId);
    expect(readDrive).toStrictEqual({
      ...drive,
      readContext: context,
    });
  });

  it("should return existing read drive for given slug", async ({ expect }) => {
    const readModeService = new ReadModeService(getDocumentModel);
    const readDriveId = "read-drive";
    const context: ReadDriveContext = {
      url: `https://switchboard.com/d/${readDriveId}`,
      filter: {
        branch: ["*"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["*"],
      },
    };
    const driveData = {
      icon: null,
      id: readDriveId,
      name: "Read drive",
      nodes: [],
      slug: "read-drive",
    };
    const drive = buildDrive(driveData);
    mockAddDrive(context.url, drive);

    await readModeService.addReadDrive(context.url, context);
    const result = await readModeService.getReadDriveBySlug("read-drive");
    expect(result).toStrictEqual({
      ...drive,
      readContext: context,
    });
  });

  it("should delete read drive", async ({ expect }) => {
    const readModeService = new ReadModeService(getDocumentModel);
    const readDriveId = "read-drive";
    const context: ReadDriveContext = {
      url: `https://switchboard.com/d/${readDriveId}`,
      filter: {
        branch: ["*"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["*"],
      },
    };
    const driveData = {
      id: readDriveId,
      name: "Read drive",
      documentType: "",
      created: "",
      lastModified: "",
      state: {
        icon: null,
        id: readDriveId,
        name: "Read drive",
        nodes: [],
        slug: "read-drive",
      },
    };
    const drive = buildDrive(driveData);
    mockAddDrive(context.url, drive);

    await readModeService.addReadDrive(context.url);
    const result = await readModeService.deleteReadDrive(readDriveId);
    expect(result).toBeUndefined();

    const result2 = await readModeService.deleteReadDrive(readDriveId);
    expect(result2).toStrictEqual(new ReadDriveNotFoundError(readDriveId));
  });

  it("should return read document from drive", async ({ expect }) => {
    const readDriveId = "read-drive";
    const documentId = "budget-statement";
    let drive = DocumentDrive.utils.createDocument({
      state: {
        global: {
          id: readDriveId,
          name: "Read drive",
          nodes: [],
          icon: null,
          slug: "read-drive",
        },
        local: {},
      },
    });
    let budgetStatement = BudgetStatement.utils.createDocument();
    const addNodeAction = DocumentDrive.actions.addFile({
      name: "Document 1",
      documentType: BudgetStatement.documentModel.id,
      id: documentId,
      synchronizationUnits: [{ syncId: "document-1", scope: "1", branch: "1" }],
    });

    drive = DocumentDrive.reducer(drive, addNodeAction);
    budgetStatement = BudgetStatement.reducer(
      budgetStatement,
      BudgetStatement.actions.addAccount({
        address: "0x123",
      }),
    );

    const readModeService = new ReadModeService(getDocumentModel);
    const context: ReadDriveContext = {
      url: `https://switchboard.com/d/${readDriveId}`,
      filter: {
        branch: ["*"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["*"],
      },
    };
    mockAddDrive(context.url, drive);

    await readModeService.addReadDrive(context.url, context);

    const drives = await readModeService.getReadDrives();
    expect(drives).toStrictEqual([readDriveId]);

    const readDrive = await readModeService.getReadDrive(readDriveId);
    const expectedDrive = { ...drive, readContext: context };
    expect(readDrive).toMatchObject(expectedDrive);

    fetchMocker.mockOnceIf(context.url, () => {
      return {
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          data: {
            document: buildDocumentResponse(budgetStatement),
          },
        }),
      };
    });

    const readDocument = await readModeService.fetchDocument(
      readDriveId,
      documentId,
      BudgetStatement.documentModel.id,
    );

    expect(readDocument).toMatchObject(budgetStatement);
  });

  it("should return ReadDriveNotFoundError if read drive ID is not found", async ({
    expect,
  }) => {
    const readMode = new ReadModeService(getDocumentModel);
    const getResult = await readMode.getReadDrive("non-existent-drive-id");
    expect(getResult).toStrictEqual(
      new ReadDriveNotFoundError("non-existent-drive-id"),
    );

    const fetchResult = await readMode.fetchDrive("non-existent-drive-id");
    expect(fetchResult).toStrictEqual(
      new ReadDriveNotFoundError("non-existent-drive-id"),
    );

    const fetchDriveDocument = await readMode.fetchDocument(
      "non-existent-drive-id",
      "non-existent-drive-id",
      "powerhouse/document-drive",
    );
    expect(fetchDriveDocument).toStrictEqual(
      new ReadDriveNotFoundError("non-existent-drive-id"),
    );

    const contextResult = await readMode.getReadDriveContext(
      "non-existent-drive-id",
    );
    expect(contextResult).toStrictEqual(
      new ReadDriveNotFoundError("non-existent-drive-id"),
    );
  });

  it("should return ReadDriveSlugNotFoundError if read drive slug is not found", async ({
    expect,
  }) => {
    const readMode = new ReadModeService(getDocumentModel);
    const result = await readMode.getReadDriveBySlug("non-existent-drive-slug");
    expect(result).toStrictEqual(
      new ReadDriveSlugNotFoundError("non-existent-drive-slug"),
    );
  });

  it("should return ReadDocumentNotFoundError when document is not found in read drive", async ({
    expect,
  }) => {
    const readModeService = new ReadModeService(getDocumentModel);
    const readDriveId = "read-drive";
    const context: ReadDriveContext = {
      url: `https://switchboard.com/d/${readDriveId}`,
      filter: {
        branch: ["*"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["*"],
      },
    };
    const driveData = {
      icon: null,
      id: readDriveId,
      name: "Read drive",
      nodes: [],
      slug: "read-drive",
    };
    const drive = buildDrive(driveData);

    fetchMocker.mockIf(context.url, async (req) => {
      const { operationName } = (await req.json()) as {
        operationName: string;
      };

      return {
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          data:
            operationName === "getDrive"
              ? { drive: driveData }
              : {
                  document: buildDocumentResponse(drive),
                },
        }),
      };
    });

    await readModeService.addReadDrive(context.url, context);

    fetchMocker.mockOnceIf(context.url, () => ({
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        data: {
          errors: [
            {
              message: "Document with id non-existent-document-id not found",
            },
          ],
          document: null,
        },
      }),
    }));
    const result = await readModeService.fetchDocument(
      readDriveId,
      "non-existent-document-id",
      "powerhouse/document-drive",
    );
    expect(result).toStrictEqual(
      new ReadDocumentNotFoundError(readDriveId, "non-existent-document-id"),
    );

    fetchMocker.mockOnceIf(context.url, () => ({
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        data: {
          errors: [
            {
              message: `Drive with id ${readDriveId} not found`,
            },
          ],
          document: null,
        },
      }),
    }));

    const result2 = await readModeService.fetchDocument(
      readDriveId,
      "non-existent-document-id",
      "powerhouse/document-drive",
    );
    expect(result2).toStrictEqual(new ReadDriveNotFoundError(readDriveId));
  });

  it("should throw Error when trying to add non existent drive", async ({
    expect,
  }) => {
    const readModeService = new ReadModeService(getDocumentModel);
    const readDriveId = "non-existent-drive-id";
    const context: ReadDriveContext = {
      url: `https://switchboard.com/d/${readDriveId}`,
      filter: {
        branch: ["*"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["*"],
      },
    };

    fetchMocker.mockIf(context.url, async (req) => {
      const { operationName } = (await req.json()) as {
        operationName: string;
      };

      return {
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          data:
            operationName === "getDrive"
              ? { drive: { id: readDriveId } }
              : {
                  document: null,
                },
        }),
      };
    });

    await expect(
      readModeService.addReadDrive(context.url),
    ).rejects.toThrowError(
      `Drive "${readDriveId}" not found at ${context.url}`,
    );
  });

  it("should throw if specific Graphql error is found", async ({ expect }) => {
    const readModeService = new ReadModeService(getDocumentModel);
    const readDriveId = "read-drive";
    const context: ReadDriveContext = {
      url: `https://switchboard.com/d/${readDriveId}`,
      filter: {
        branch: ["*"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["*"],
      },
    };
    const driveData = {
      icon: null,
      id: readDriveId,
      name: "Read drive",
      nodes: [],
      slug: "read-drive",
    };
    const drive = buildDrive(driveData);

    fetchMocker.mockIf(context.url, async (req) => {
      const { operationName } = (await req.json()) as {
        operationName: string;
      };

      return {
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          data:
            operationName === "getDrive"
              ? { drive: driveData }
              : {
                  document: buildDocumentResponse(drive),
                },
        }),
      };
    });

    await readModeService.addReadDrive(context.url, context);

    fetchMocker.mockOnceIf(context.url, () => ({
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        data: {
          document: null,
          errors: [
            {
              message:
                'Cannot query field "revisio" on type "IDocument". Did you mean "revision"?',
            },
          ],
        },
      }),
    }));

    await expect(
      readModeService.fetchDocument(
        readDriveId,
        "document-id",
        "powerhouse/document-drive",
      ),
    ).rejects.toThrowError(
      'Cannot query field "revisio" on type "IDocument". Did you mean "revision"?',
    );

    fetchMocker.mockOnceIf(context.url, () => ({
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        data: {
          document: null,
          errors: [
            {
              message: `Drive with id ${readDriveId} not found`,
            },
          ],
        },
      }),
    }));
    const result = await readModeService.fetchDrive(readDriveId);
    expect(result).toStrictEqual(new ReadDriveNotFoundError(readDriveId));
  });

  it("should throw ReadDriveNotFoundError if no document is returned", async ({
    expect,
  }) => {
    const readModeService = new ReadModeService(getDocumentModel);
    const readDriveId = "read-drive";
    const context: ReadDriveContext = {
      url: `https://switchboard.com/d/${readDriveId}`,
      filter: {
        branch: ["*"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["*"],
      },
    };

    fetchMocker.mockIf(context.url, async (req) => {
      const { operationName } = (await req.json()) as {
        operationName: string;
      };

      return {
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          data:
            operationName === "getDrive"
              ? { drive: { id: readDriveId } }
              : {
                  document: null,
                  errors: [
                    {
                      message: `Drive "${readDriveId}" not found at ${context.url}`,
                    },
                  ],
                },
        }),
      };
    });

    await expect(
      readModeService.addReadDrive(context.url),
    ).rejects.toThrowError(
      `Drive "${readDriveId}" not found at ${context.url}`,
    );
  });

  it("should return ReadDocumentNotFoundError if no document is returned", async ({
    expect,
  }) => {
    const readModeService = new ReadModeService(getDocumentModel);
    const readDriveId = "read-drive";
    const context: ReadDriveContext = {
      url: `https://switchboard.com/d/${readDriveId}`,
      filter: {
        branch: ["*"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["*"],
      },
    };
    const driveData = {
      icon: null,
      id: readDriveId,
      name: "Read drive",
      nodes: [],
      slug: "read-drive",
    };
    const drive = buildDrive(driveData);

    fetchMocker.mockIf(context.url, async (req) => {
      const { operationName } = (await req.json()) as {
        operationName: string;
      };

      return {
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          data:
            operationName === "getDrive"
              ? { drive: driveData }
              : {
                  document: buildDocumentResponse(drive),
                },
        }),
      };
    });

    await readModeService.addReadDrive(context.url, context);
    fetchMocker.mockOnceIf(context.url, () => ({
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        data: {
          document: null,
        },
      }),
    }));

    const result = await readModeService.fetchDocument(
      readDriveId,
      "document-id",
      "powerhouse/document-drive",
    );

    expect(result).toStrictEqual(
      new ReadDocumentNotFoundError(readDriveId, "document-id"),
    );

    const result2 = await readModeService.fetchDocument(
      readDriveId,
      "document-id",
      "powerhouse/non-existing-model",
    );

    expect(result2).toStrictEqual(
      new DocumentModelNotFoundError("powerhouse/non-existing-model"),
    );
  });
});
