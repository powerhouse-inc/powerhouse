/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-deprecated */
import { type RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  type ServerNotification,
  type ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { IDocumentDriveServer } from "document-drive";
import { DocumentNotFoundError } from "document-drive/server/error";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactorMcpProvider } from "../src/mcp/reactor.js";

const mockExtra = {} as RequestHandlerExtra<ServerRequest, ServerNotification>;
// Mock reactor
const createMockReactor = (): IDocumentDriveServer => {
  const mockReactor = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getDocument: vi.fn(),
  } as unknown as IDocumentDriveServer;

  return mockReactor;
};

describe("ReactorMcpProvider", () => {
  let mockReactor: IDocumentDriveServer;

  beforeEach(() => {
    mockReactor = createMockReactor();
    vi.clearAllMocks();
  });

  it("should initialize reactor on creation", async () => {
    await createReactorMcpProvider(mockReactor);

    expect(mockReactor.initialize).toHaveBeenCalledOnce();
  });

  it("getDocument tool", async () => {
    const document = documentModelDocumentModelModule.utils.createDocument();
    mockReactor.getDocument = vi.fn().mockResolvedValue(document);

    const provider = await createReactorMcpProvider(mockReactor);
    const result = await provider.tools.getDocument.callback(
      {
        id: document.header.id,
      },
      mockExtra,
    );

    expect(mockReactor.getDocument).toHaveBeenCalledWith(document.header.id);
    expect(result.content).toStrictEqual([]);
    expect(result.structuredContent).toStrictEqual({
      document: document,
    });
    expect(result.isError).toBeUndefined();
  });

  it("should handle errors gracefully", async () => {
    const error = new Error("Document not found");
    mockReactor.getDocument = vi.fn().mockRejectedValue(error);

    const provider = await createReactorMcpProvider(mockReactor);
    const result = await provider.tools.getDocument.callback(
      {
        id: "non-existent-id",
      },
      mockExtra,
    );

    expect(mockReactor.getDocument).toHaveBeenCalledWith("non-existent-id");
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: "Error: Document not found",
      },
    ]);
    expect(result.structuredContent).toEqual({
      error: "Document not found",
    });
  });

  it("should handle non-Error exceptions", async () => {
    const errorMessage = "String error message";
    mockReactor.getDocument = vi.fn().mockRejectedValue(errorMessage);

    const provider = await createReactorMcpProvider(mockReactor);
    const result = await provider.tools.getDocument.callback(
      {
        id: "test-id",
      },
      mockExtra,
    );

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: "Error: String error message",
      },
    ]);
    expect(result.structuredContent).toEqual({
      error: "String error message",
    });
  });

  it("should handle invalid output", async () => {
    mockReactor.getDocument = vi.fn().mockResolvedValue(undefined);

    const provider = await createReactorMcpProvider(mockReactor);
    const result = await provider.tools.getDocument.callback(
      {
        id: "test-id",
      },
      mockExtra,
    );

    const expectedErrorMessage = `Invalid tool output\n${JSON.stringify(
      [
        {
          code: "invalid_type",
          expected: "object",
          received: "undefined",
          path: ["document"],
          message: "Required",
        },
      ],
      null,
      2,
    )}`;

    expect(result.isError).toBe(true);
    expect(result.content).toStrictEqual([
      {
        type: "text",
        text: `Error: ${expectedErrorMessage}`,
      },
    ]);
    expect(result.structuredContent).toEqual({
      error: expectedErrorMessage,
    });
  });

  it("should handle empty string ID", async () => {
    mockReactor.getDocument = vi
      .fn()
      .mockRejectedValue(new DocumentNotFoundError(""));

    const provider = await createReactorMcpProvider(mockReactor);
    const result = await provider.tools.getDocument.callback(
      { id: "" },
      mockExtra,
    );

    expect(mockReactor.getDocument).toHaveBeenCalledWith("");
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: "Error: Document with id  not found",
      },
    ]);
    expect(result.structuredContent).toEqual({
      error: "Document with id  not found",
    });
  });
});
