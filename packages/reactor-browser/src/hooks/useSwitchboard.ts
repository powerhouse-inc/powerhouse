import { type IDocumentDriveServer } from "document-drive";
import { generateDocumentStateQueryFields } from "document-drive/utils/graphql";

export function useSwitchboard(reactor: IDocumentDriveServer) {
  return {
    getDriveIdBySlug: async (driveUrl: string, slug: string) => {
      if (!driveUrl) {
        return;
      }

      const urlParts = driveUrl.split("/");
      urlParts.pop(); // remove id
      urlParts.pop(); // remove /d
      urlParts.push("drives"); // add /drives
      const drivesUrl = urlParts.join("/");
      const result = await fetch(drivesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
                        query getDriveIdBySlug($slug: String!) {
                            driveIdBySlug(slug: $slug)
                        }
                    `,
          variables: {
            slug,
          },
        }),
      });

      const data = (await result.json()) as {
        data: { driveIdBySlug: string };
      };

      return data.data.driveIdBySlug;
    },

    getSwitchboardGatewayUrl: (driveUrl: string) => {
      const urlParts = driveUrl.split("/");
      urlParts.pop(); // remove id
      urlParts.pop(); // remove /d
      urlParts.push("graphql"); // add /graphql
      return urlParts.join("/");
    },

    getDocumentGraphqlQuery: async (driveId: string, documentId: string) => {
      const doc = await reactor.getDocument(driveId, documentId);
      const docModel = reactor
        .getDocumentModelModules()
        .find((m) => m.documentModel.id === doc.documentType);

      if (!docModel) {
        throw new Error("Document model not found");
      }

      const stateFields = generateDocumentStateQueryFields(
        docModel.documentModel,
        "document",
      );
      return `
        query getDocument($documentId: String!) {
          ${docModel.documentModel.name} {
            getDocument(id: $documentId) {
              ${stateFields}
            }
          }
        }
      `;
    },
  };
}
