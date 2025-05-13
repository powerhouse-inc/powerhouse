import { DriveSubgraph } from "#graphql/drive/index.js";
import { driveDocumentModelModule, ReactorBuilder } from "document-drive";
import { documentModelDocumentModelModule, generateId } from "document-model";
import { describe, expect, it, vi } from "vitest";

describe("DriveSubgraph", () => {
  it("should be able to instantiate", () => {
    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as any).build();

    const driveSubgraph = new DriveSubgraph({ reactor } as any);

    expect(driveSubgraph).toBeInstanceOf(DriveSubgraph);
  });

  it("should return drive data", async () => {
    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as any).build();

    const reactorSpy = vi.spyOn(reactor, "getDrive");

    const driveId = generateId();
    const mockDriveData = {
      id: driveId,
      meta: {
        preferredEditor: "test-editor",
      },
      global: {
        name: "test-drive",
        icon: undefined,
      },
    };

    const createdDrive = await reactor.addDrive(mockDriveData);

    const driveSubgraph = new DriveSubgraph({ reactor } as any);

    const context = {
      driveId,
    };

    const drive = await (driveSubgraph.resolvers.Query as any)?.drive(
      null,
      {},
      context as any,
    );

    expect(drive).toEqual({
      id: createdDrive.id,
      slug: createdDrive.slug,
      meta: createdDrive.meta,
      name: createdDrive.state.global.name,
      icon: createdDrive.state.global.icon ?? undefined,
    });
    expect(reactorSpy).toHaveBeenCalledWith(context.driveId);
  });

  it("should return drive data with slug", async () => {
    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as any).build();

    const getBySlugSpy = vi.spyOn(reactor, "getDriveBySlug");
    const getByIdSpy = vi.spyOn(reactor, "getDrive");
    const driveSubgraph = new DriveSubgraph({ reactor } as any);

    const driveId = generateId();
    const createdDrive = await reactor.addDrive({
      id: driveId,
      slug: "test-drive",
      global: {
        name: "test-drive",
        icon: undefined,
      },
    });

    const context = {
      driveId: "test-drive",
    };

    const drive = await (driveSubgraph.resolvers.Query as any)?.drive(
      null,
      {},
      context as any,
    );

    expect(drive).toStrictEqual({
      id: createdDrive.id,
      slug: createdDrive.slug,
      meta: createdDrive.meta,
      name: createdDrive.state.global.name,
      icon: createdDrive.state.global.icon ?? undefined,
    });
    expect(getBySlugSpy).toHaveBeenCalledWith("test-drive");
    expect(getByIdSpy).toHaveBeenCalledWith(driveId);
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
      getDriveIdBySlug: vi.fn().mockResolvedValue("test-drive-id"),
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
      getDriveIdBySlug: vi.fn().mockResolvedValue("test-drive-id"),
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
