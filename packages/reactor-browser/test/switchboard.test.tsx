// test suite for the switchboard hooks

import { driveDocumentModelModule } from "document-drive";
import { generateDocumentStateQueryFields } from "document-drive/utils/graphql";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
} from "document-model";
import { describe, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import {
  getDocumentGraphqlQuery,
  getSwitchboardGatewayUrl,
  useGetSwitchboardLink,
} from "../src/hooks/useSwitchboard.js";

describe("Switchboard hooks", () => {
  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule[];

  it("should return the proper switchboard url", () => {
    const url = getSwitchboardGatewayUrl("https://example.com/d/123");
    expect(url).toBe("https://example.com/graphql");
  });

  it("should generate the proper query for a document type", () => {
    const stateFields = generateDocumentStateQueryFields(
      driveDocumentModelModule.documentModel,
      "document",
    );
    expect(
      getDocumentGraphqlQuery(
        documentModels,
        driveDocumentModelModule.documentModel.id,
      ),
    ).toBe(
      `
        query getDocument($documentId: String!) {
          DocumentDrive {
            getDocument(id: $documentId) {
              ${stateFields}
            }
          }
        }
      `,
    );
  });

  it("should return the proper switchboard link", () => {
    const document = driveDocumentModelModule.utils.createDocument();

    const { result } = renderHook(() =>
      useGetSwitchboardLink(
        "https://example.com/d/123",
        document.documentType,
        documentModels,
      ),
    );
    expect(result.current).toBe(
      "https://example.com/graphql?query=...on+DocumentDrive+...on+DocumentModel",
    );
  });
});
