import { SystemSubgraph } from "#graphql/system/index.js";
import { driveDocumentModelModule, ReactorBuilder } from "document-drive";
import { documentModelDocumentModelModule, generateId } from "document-model";
import { GraphQLError } from "graphql";
import { describe, expect, it, vi } from "vitest";

describe("SystemSubgraph", () => {
  it("should be able to instantiate", () => {
    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as any).build();

    const systemSubgraph = new SystemSubgraph({ reactor } as any);

    expect(systemSubgraph).toBeInstanceOf(SystemSubgraph);
  });

  it("should return drives data", async () => {
    const mockDrivesData = ["drive1", "drive2", "drive3"];

    const mockReactor = {
      getDrivesSlugs: vi.fn().mockResolvedValue(mockDrivesData),
    };

    const systemSubgraph = new SystemSubgraph({ reactor: mockReactor } as any);

    const drives = await (systemSubgraph.resolvers.Query as any)?.drives();

    expect(drives).toEqual(mockDrivesData);
    expect(mockReactor.getDrivesSlugs).toHaveBeenCalled();
  });

  it("should add drive successfully with admin authorization", async () => {
    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as any).build();

    const mockDriveData = {
      id: generateId(),
      slug: "test-drive",
      global: {
        name: "Test Drive",
        icon: "test-icon",
      },
      local: {},
    };

    const mockIsAdmin = vi.fn().mockReturnValue(true);
    const mockUser = {
      address: "0x1234567890123456789012345678901234567890",
      chainId: 1,
      networkId: "mainnet",
    };

    const context = {
      isAdmin: mockIsAdmin,
      user: mockUser,
    };

    const systemSubgraph = new SystemSubgraph({ reactor } as any);

    const result = await (systemSubgraph.resolvers.Mutation as any)?.addDrive(
      null,
      {
        name: "Test Drive",
        icon: "test-icon",
        id: mockDriveData.id,
        slug: "test-drive",
        preferredEditor: "test-editor",
      },
      context,
    );

    expect(result).toMatchObject({
      id: expect.any(String),
      slug: "test-drive",
      name: "Test Drive",
      icon: "test-icon",
      preferredEditor: "test-editor",
    });
    expect(mockIsAdmin).toHaveBeenCalledWith(mockUser.address);
  });

  it("should throw error when adding drive without admin authorization", async () => {
    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as any).build();

    const mockIsAdmin = vi.fn().mockReturnValue(false);
    const mockUser = {
      address: "0x1234567890123456789012345678901234567890",
      chainId: 1,
      networkId: "mainnet",
    };

    const context = {
      isAdmin: mockIsAdmin,
      user: mockUser,
    };

    const systemSubgraph = new SystemSubgraph({ reactor } as any);

    await expect(
      (systemSubgraph.resolvers.Mutation as any)?.addDrive(
        null,
        {
          name: "Test Drive",
          icon: "test-icon",
          id: generateId(),
          slug: "test-drive",
        },
        context,
      ),
    ).rejects.toThrow(GraphQLError);
    expect(mockIsAdmin).toHaveBeenCalledWith(mockUser.address);
  });

  it("should delete drive successfully with admin authorization", async () => {
    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as any).build();

    const driveId = generateId();
    const mockDriveData = {
      id: driveId,
      global: {
        name: "Test Drive",
        icon: undefined,
      },
      local: {},
    };

    // First add a drive to delete
    await reactor.addDrive(mockDriveData);

    const mockIsAdmin = vi.fn().mockReturnValue(true);
    const mockUser = {
      address: "0x1234567890123456789012345678901234567890",
      chainId: 1,
      networkId: "mainnet",
    };

    const context = {
      isAdmin: mockIsAdmin,
      user: mockUser,
    };

    const systemSubgraph = new SystemSubgraph({ reactor } as any);

    const result = await (
      systemSubgraph.resolvers.Mutation as any
    )?.deleteDrive(null, { id: driveId }, context);

    expect(result).toBe(true);
    expect(mockIsAdmin).toHaveBeenCalledWith(mockUser.address);
  });

  it("should throw error when deleting drive without admin authorization", async () => {
    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as any).build();

    const driveId = generateId();

    const mockIsAdmin = vi.fn().mockReturnValue(false);
    const mockUser = {
      address: "0x1234567890123456789012345678901234567890",
      chainId: 1,
      networkId: "mainnet",
    };

    const context = {
      isAdmin: mockIsAdmin,
      user: mockUser,
    };

    const systemSubgraph = new SystemSubgraph({ reactor } as any);

    await expect(
      (systemSubgraph.resolvers.Mutation as any)?.deleteDrive(
        null,
        { id: driveId },
        context,
      ),
    ).rejects.toThrow(GraphQLError);
    expect(mockIsAdmin).toHaveBeenCalledWith(mockUser.address);
  });

  it("should handle addDrive errors gracefully", async () => {
    const mockReactor = {
      addDrive: vi.fn().mockRejectedValue(new Error("Drive creation failed")),
    };

    const mockIsAdmin = vi.fn().mockReturnValue(true);
    const mockUser = {
      address: "0x1234567890123456789012345678901234567890",
      chainId: 1,
      networkId: "mainnet",
    };

    const context = {
      isAdmin: mockIsAdmin,
      user: mockUser,
    };

    const systemSubgraph = new SystemSubgraph({ reactor: mockReactor } as any);

    await expect(
      (systemSubgraph.resolvers.Mutation as any)?.addDrive(
        null,
        {
          name: "Test Drive",
          icon: "test-icon",
          id: generateId(),
          slug: "test-drive",
        },
        context,
      ),
    ).rejects.toThrow("Drive creation failed");
  });

  it("should handle deleteDrive errors gracefully", async () => {
    const mockReactor = {
      deleteDrive: vi
        .fn()
        .mockRejectedValue(new Error("Drive deletion failed")),
    };

    const mockIsAdmin = vi.fn().mockReturnValue(true);
    const mockUser = {
      address: "0x1234567890123456789012345678901234567890",
      chainId: 1,
      networkId: "mainnet",
    };

    const context = {
      isAdmin: mockIsAdmin,
      user: mockUser,
    };

    const systemSubgraph = new SystemSubgraph({ reactor: mockReactor } as any);

    const result = await (
      systemSubgraph.resolvers.Mutation as any
    )?.deleteDrive(null, { id: generateId() }, context);

    expect(result).toBe(false);
  });

  it("should add drive with minimal required fields", async () => {
    const reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as any).build();

    const mockIsAdmin = vi.fn().mockReturnValue(true);
    const mockUser = {
      address: "0x1234567890123456789012345678901234567890",
      chainId: 1,
      networkId: "mainnet",
    };

    const context = {
      isAdmin: mockIsAdmin,
      user: mockUser,
    };

    const systemSubgraph = new SystemSubgraph({ reactor } as any);

    const result = await (systemSubgraph.resolvers.Mutation as any)?.addDrive(
      null,
      {
        name: "Minimal Drive",
      },
      context,
    );

    expect(result).toMatchObject({
      id: expect.any(String),
      slug: expect.any(String),
      name: "Minimal Drive",
      icon: undefined,
    });
  });
});
