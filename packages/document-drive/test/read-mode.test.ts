import {
  createDocument as createDocumentModelDocument,
  createState as createDocumentModelState,
  DocumentModelDocument,
  documentModelDocumentModelModule,
  DocumentModelModule,
  DocumentModelState,
  generateId,
  PHDocument,
} from "document-model";
import { GraphQLError } from "graphql";
import { beforeEach, describe, it, vi, vitest } from "vitest";
import createFetchMock from "vitest-fetch-mock";
import {
  addFile,
  updateNode,
} from "../src/drive-document-model/gen/creators.js";
import { reducer } from "../src/drive-document-model/gen/reducer.js";
import {
  DocumentDriveDocument,
  DocumentDriveState,
} from "../src/drive-document-model/gen/types.js";
import {
  createDocument,
  createState,
} from "../src/drive-document-model/gen/utils.js";
import { driveDocumentModelModule } from "../src/drive-document-model/module.js";
import {
  ReadDocumentNotFoundError,
  ReadDriveNotFoundError,
  ReadDriveSlugNotFoundError,
} from "../src/read-mode/errors.js";
import { ReadModeService } from "../src/read-mode/service.js";
import { ReadDrive, ReadDriveContext } from "../src/read-mode/types.js";
import { DocumentModelNotFoundError } from "../src/server/error.js";

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();
vitest.useFakeTimers();

const documentModels = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
] as DocumentModelModule[];

function getDocumentModelModule<TDocument extends PHDocument>(
  id: string,
): DocumentModelModule<TDocument> {
  const documentModel = documentModels.find((d) => d.documentModel.id === id);
  if (!documentModel) {
    throw new Error(`Document model not found for id: ${id}`);
  }
  return documentModel as unknown as DocumentModelModule<TDocument>;
}

function buildDriveDocument(
  { id, slug }: { id: string; slug: string },
  state: Partial<DocumentDriveState>,
): DocumentDriveDocument {
  return createDocument({
    id,
    slug,
    state: createState({
      global: state,
    }),
  });
}

function buildModelDocument(
  state: Partial<DocumentModelState>,
): DocumentModelDocument {
  return createDocumentModelDocument({
    state: createDocumentModelState({
      global: state,
    }),
  });
}

function buildDocumentResponse(drive: PHDocument) {
  return {
    ...drive,
    revision: drive.revision,
    state: drive.state,
    operations: drive.operations.global.map(({ input, ...op }) => ({
      ...op,
      inputText: JSON.stringify(input),
    })),
    initialState: drive.initialState,
  };
}

function mockAddDrive(url: string, drive: DocumentDriveDocument) {
  fetchMocker.mockIf(url, async (req) => {
    const { operationName } = (await req.json()) as {
      operationName: string;
    };

    return {
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        data:
          operationName === "getDrive"
            ? { drive: { ...drive.state.global, id: drive.id } }
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
    const readModeService = new ReadModeService(getDocumentModelModule);
    const readDriveId = generateId();
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
      name: "Read drive",
      nodes: [],
    };

    const drive = buildDriveDocument(
      {
        id: readDriveId,
        slug: "read-drive",
      },
      driveData,
    );
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
            meta {
              preferredEditor
            }
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
                            name nodes { ... on DocumentDrive_FolderNode { id name kind parentFolder } ... on DocumentDrive_FileNode { id name kind documentType parentFolder synchronizationUnits { syncId scope branch } } } icon
                        }
                        initialState {
                            name nodes { ... on DocumentDrive_FolderNode { id name kind parentFolder } ... on DocumentDrive_FileNode { id name kind documentType parentFolder synchronizationUnits { syncId scope branch } } } icon
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
    const readModeService = new ReadModeService(getDocumentModelModule);
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
    };
    const drive = buildDriveDocument(
      {
        id: readDriveId,
        slug: "read-drive",
      },
      driveData,
    );

    mockAddDrive(context.url, drive);

    await readModeService.addReadDrive(context.url, context);
    const result = await readModeService.getReadDriveBySlug("read-drive");

    expect(result).toStrictEqual({
      ...drive,
      readContext: context,
    });
  });

  it("should delete read drive", async ({ expect }) => {
    const readModeService = new ReadModeService(getDocumentModelModule);
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
      name: "Read drive",
      documentType: "",
      created: "",
      lastModified: "",
      state: {
        icon: null,
        id: readDriveId,
        name: "Read drive",
        nodes: [],
      },
    };
    const drive = buildDriveDocument(
      {
        id: readDriveId,
        slug: "read-drive",
      },
      driveData,
    );
    mockAddDrive(context.url, drive);

    await readModeService.addReadDrive(context.url);
    const result = await readModeService.deleteReadDrive(readDriveId);
    expect(result).toBeUndefined();

    const result2 = await readModeService.deleteReadDrive(readDriveId);
    expect(result2).toStrictEqual(new ReadDriveNotFoundError(readDriveId));
  });

  it("should return read document from drive", async ({ expect }) => {
    const readDriveId = generateId();
    const documentId = generateId();

    let drive = createDocument({
      id: readDriveId,
      slug: "read-drive",
      state: {
        global: {
          name: "Read drive",
          nodes: [],
          icon: null,
        },
        local: {},
      },
    });
    let document = createDocument();
    const addNodeAction = addFile({
      name: "Document 1",
      documentType: documentModelDocumentModelModule.documentModel.id,
      id: documentId,
      synchronizationUnits: [{ syncId: "document-1", scope: "1", branch: "1" }],
    });

    drive = reducer(drive, addNodeAction);
    document = reducer(
      document,
      updateNode({
        name: "bar",
        id: documentId,
      }),
    );

    const readModeService = new ReadModeService(getDocumentModelModule);
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
            document: buildDocumentResponse(document),
          },
        }),
      };
    });

    const readDocument = await readModeService.fetchDocument(
      readDriveId,
      documentId,
      driveDocumentModelModule.documentModel.id,
    );

    expect(readDocument).toMatchObject(document);
  });

  it("should return ReadDriveNotFoundError if read drive ID is not found", async ({
    expect,
  }) => {
    const readMode = new ReadModeService(getDocumentModelModule);
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
    const readMode = new ReadModeService(getDocumentModelModule);
    const result = await readMode.getReadDriveBySlug("non-existent-drive-slug");
    expect(result).toStrictEqual(
      new ReadDriveSlugNotFoundError("non-existent-drive-slug"),
    );
  });

  it("should return ReadDocumentNotFoundError when document is not found in read drive", async ({
    expect,
  }) => {
    const readModeService = new ReadModeService(getDocumentModelModule);
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
    const drive = buildModelDocument(driveData);

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
    const readModeService = new ReadModeService(getDocumentModelModule);
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
    ).rejects.toThrowError(new ReadDriveNotFoundError(readDriveId));
  });

  it("should throw if specific Graphql error is found", async ({ expect }) => {
    const readModeService = new ReadModeService(getDocumentModelModule);
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
    const drive = buildModelDocument(driveData);

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

    try {
      await readModeService.fetchDocument(
        readDriveId,
        "document-id",
        "powerhouse/document-drive",
      );
    } catch (error) {
      expect(error).toStrictEqual(
        new GraphQLError(
          'Cannot query field "revisio" on type "IDocument". Did you mean "revision"?',
        ),
      );
    }

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
    const readModeService = new ReadModeService(getDocumentModelModule);
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
      new GraphQLError(`Drive "${readDriveId}" not found at ${context.url}`),
    );
  });

  it("should return ReadDocumentNotFoundError if no document is returned", async ({
    expect,
  }) => {
    const readModeService = new ReadModeService(getDocumentModelModule);
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
    const drive = buildModelDocument(driveData);

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

    // DocumentModelNotFoundError has an error inside of it so we just test the id
    expect((result2 as DocumentModelNotFoundError).id).toBe(
      "powerhouse/non-existing-model",
    );
  });
});
