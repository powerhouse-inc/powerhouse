// test suite for the switchboard hooks

import {
  driveDocumentModelModule,
  type IDocumentDriveServer,
  ReactorBuilder,
} from "document-drive";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
} from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSwitchboard } from "../src/hooks/useSwitchboard.js";

describe("Switchboard hooks", () => {
  let reactor: IDocumentDriveServer;
  beforeEach(async () => {
    const documentModels = [
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as DocumentModelModule[];
    reactor = new ReactorBuilder(documentModels).build();
    await reactor.initialize();

    // Mock getDocument to return a document with documentModel type
    reactor.getDocument = vi
      .fn()
      .mockImplementation(async (driveId: string, documentId: string) => {
        return {
          id: documentId,
          driveId,
          documentType: "document-model",
          state: {
            name: "TestDocument",
            fields: {
              title: { type: "string" },
              content: { type: "string" },
              createdAt: { type: "date" },
              metadata: {
                type: "object",
                fields: {
                  tags: { type: "array", items: { type: "string" } },
                  version: { type: "number" },
                },
              },
            },
          },
        };
      });

    // Mock getDocumentModelModules to return the document model module
    reactor.getDocumentModelModules = vi.fn().mockReturnValue([
      {
        reducer: vi.fn(),
        actions: {},
        utils: {},
        documentModel: {
          id: "document-model",
          name: "TestDocument",
          extension: ".phdm",
          description: "Test document model",
          author: {
            name: "Powerhouse",
            website: "https://powerhouse.inc",
          },
          specifications: [
            {
              version: 1,
              changeLog: [],
              state: {
                global: {
                  schema:
                    "type TestDocumentState { title: String content: String createdAt: String metadata: Metadata } type Metadata { tags: [String!]! version: Int! }",
                  initialValue:
                    '{"title":"","content":"","createdAt":"","metadata":{"tags":[],"version":1}}',
                  examples: [],
                },
                local: {
                  schema: "",
                  initialValue: '""',
                  examples: [],
                },
              },
              modules: [],
            },
          ],
        },
      },
    ]);
  });

  it("should return the proper switchboard url", async () => {
    if (!reactor) {
      throw new Error("Reactor not initialized");
    }
    const { getSwitchboardGatewayUrl } = useSwitchboard(reactor);
    const url = getSwitchboardGatewayUrl("https://example.com/d/123");
    expect(url).toBe("https://example.com/graphql");
  });

  it("should generate the proper query for a document type", async () => {
    if (!reactor) {
      throw new Error("Reactor not initialized");
    }
    const { getDocumentGraphqlQuery } = useSwitchboard(reactor);
    const query = await getDocumentGraphqlQuery("123", "456");
    expect(query).toBe(
      `
        query getDocument($documentId: String!) {
          TestDocument {
            getDocument(id: $documentId) {
              title content createdAt metadata { tags version }
            }
          }
        }
      `,
    );
  });
});
