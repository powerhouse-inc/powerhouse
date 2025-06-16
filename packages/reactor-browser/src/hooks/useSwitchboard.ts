import { generateDocumentStateQueryFields } from "document-drive/utils/graphql";
import { type DocumentModelModule } from "document-model";
import { useMemo } from "react";

export async function getDriveIdBySlug(driveUrl: string, slug: string) {
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
}

export function getSwitchboardGatewayUrl(driveUrl: string) {
  const urlParts = driveUrl.split("/");
  urlParts.pop(); // remove id
  urlParts.pop(); // remove /d
  urlParts.push("graphql"); // add /graphql
  return urlParts.join("/");
}

export function getDocumentGraphqlQuery(
  documentModels: DocumentModelModule[],
  documentType: string,
) {
  const docModel = documentModels.find(
    (m) => m.documentModel.id === documentType,
  );
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
}

export const useGetSwitchboardLink = (
  url: string,
  documentType: string,
  documentModels: DocumentModelModule[],
) => {
  return useMemo(() => {
    if (!url || !documentType || !documentModels.length) {
      return null;
    }

    try {
      const switchboardUrl = getSwitchboardGatewayUrl(url);
      const query = getDocumentGraphqlQuery(documentModels, documentType);
      const encodedQuery = encodeURIComponent(query);
      return `${switchboardUrl}?query=${encodedQuery}`;
    } catch (error) {
      console.warn("Error generating switchboard link", error);
      return null;
    }
  }, [url, documentType, documentModels]);
};
