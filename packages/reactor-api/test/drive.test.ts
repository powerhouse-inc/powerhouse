import { DriveSubgraph } from "#graphql/drive/index.js";
import { driveDocumentModelModule } from "document-drive";
import { describe, expect, it, vi } from "vitest";

describe("DriveSubgraph", () => {
  it("should be able to instantiate", () => {
    const mockReactor = {
      getDrive: vi.fn(),
      getDocuments: vi.fn(),
      getDocument: vi.fn(),
      getDocumentModelModules: vi.fn(),
      listeners: {
        setListener: vi.fn(),
      },
    };

    const mockSubgraphArgs = {
      reactor: mockReactor,
    };

    const driveSubgraph = new DriveSubgraph(mockSubgraphArgs as any);

    expect(driveSubgraph).toBeInstanceOf(DriveSubgraph);
  });

  it("should return drive data", async () => {
    const mockDriveData = {
      meta: {
        preferredEditor: "test-editor",
      },
      state: driveDocumentModelModule.utils.createState(),
    };

    const mockReactor = {
      getDrive: vi.fn().mockResolvedValue(mockDriveData),
      getDocuments: vi.fn(),
      getDocument: vi.fn(),
      getDocumentModelModules: vi.fn(),
      listeners: {
        setListener: vi.fn(),
      },
    };

    const mockSubgraphArgs = {
      reactor: mockReactor,
    };

    const driveSubgraph = new DriveSubgraph(mockSubgraphArgs as any);

    const context = {
      driveId: "test-drive-id",
    };

    const drive = await (driveSubgraph.resolvers.Query as any)?.drive(
      null,
      {},
      context as any,
    );

    expect(drive).toEqual({
      meta: mockDriveData.meta,
      ...mockDriveData.state.global,
      nodes: mockDriveData.state.global.nodes,
    });
    expect(mockReactor.getDrive).toHaveBeenCalledWith(context.driveId);
  });

  it("should return documents data", async () => {
    const mockDocumentsData = ["doc1", "doc2"];

    const mockReactor = {
      getDrive: vi.fn(),
      getDocuments: vi.fn().mockResolvedValue(mockDocumentsData),
      getDocument: vi.fn(),
      getDocumentModelModules: vi.fn(),
      listeners: {
        setListener: vi.fn(),
      },
    };

    const mockSubgraphArgs = {
      reactor: mockReactor,
    };

    const driveSubgraph = new DriveSubgraph(mockSubgraphArgs as any);

    const context = {
      driveId: "test-drive-id",
    };

    const documents = await (driveSubgraph.resolvers.Query as any)?.documents(
      null,
      {},
      context as any,
    );

    expect(documents).toEqual(mockDocumentsData);
    expect(mockReactor.getDocuments).toHaveBeenCalledWith(context.driveId);
  });

  it("should return document data", async () => {
    const mockDocumentData = driveDocumentModelModule.utils.createDocument();

    // {
    //   id: "test-document-id",
    //   documentType: "test-document-type",
    //   revision: { global: 1 },
    //   state: { global: { data: "test-data" } },
    //   operations: { global: [] },
    //   initialState: { state: { global: {} } },
    // };

    const mockReactor = {
      getDrive: vi.fn(),
      getDocuments: vi.fn(),
      getDocument: vi.fn().mockResolvedValue(mockDocumentData),
      getDocumentModelModules: vi.fn().mockReturnValue([
        {
          documentModel: { id: "test-document-type", name: "Test Document" },
        },
      ]),
      listeners: {
        setListener: vi.fn(),
      },
    };

    const mockSubgraphArgs = {
      reactor: mockReactor,
    };

    const driveSubgraph = new DriveSubgraph(mockSubgraphArgs as any);

    const context = {
      driveId: "test-drive-id",
    };

    const document = await (driveSubgraph.resolvers.Query as any)?.document(
      null,
      { id: mockDocumentData.id },
      context as any,
    );

    expect(document).toStrictEqual({
      ...mockDocumentData,
      revision: mockDocumentData.revision.global,
      state: mockDocumentData.state.global,
      initialState: mockDocumentData.initialState.state.global,
      stateJSON: mockDocumentData.state.global,
      operations: mockDocumentData.operations.global,
      __typename: "",
    });

    expect(mockReactor.getDocument).toHaveBeenCalledWith(
      context.driveId,
      mockDocumentData.id,
    );
  });
});
