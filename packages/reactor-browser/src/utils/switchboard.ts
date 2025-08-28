import { kebabCase } from "change-case";
import { generateDocumentStateQueryFields } from "document-drive";
import type { DocumentModelState } from "document-model";
import { compressToEncodedURIComponent } from "lz-string";

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

export function getSlugFromDriveUrl(driveUrl: string) {
  const urlParts = driveUrl.split("/");
  return urlParts.pop();
}

export function getSwitchboardGatewayUrlFromDriveUrl(driveUrl: string) {
  const urlParts = driveUrl.split("/");
  urlParts.pop(); // remove id
  urlParts.pop(); // remove /d
  urlParts.push("graphql"); // add /graphql
  return urlParts.join("/");
}

export function getDocumentGraphqlQuery(documentModel: DocumentModelState) {
  const stateFields = generateDocumentStateQueryFields(
    documentModel,
    "document",
  );
  return `query getDocument($documentId: PHID!, $driveId: String) {
  ${documentModel.name} {
    getDocument(docId: $documentId, driveId: $driveId) {
      id
      created
      lastModified
      name
      revision
      state {
        ${stateFields}
      }
    }
  }
}`;
}

export function buildDocumentSubgraphQuery(
  driveUrl: string,
  documentId: string,
  documentModel: DocumentModelState,
) {
  const driveSlug = getSlugFromDriveUrl(driveUrl);
  const query = getDocumentGraphqlQuery(documentModel);
  const variables = { documentId, driveId: driveSlug };
  return compressToEncodedURIComponent(
    JSON.stringify({
      document: query.trim(),
      variables: JSON.stringify(variables, null, 2),
    }),
  );
}

export function buildDocumentSubgraphUrl(
  driveUrl: string,
  documentId: string,
  documentModel: DocumentModelState,
) {
  const switchboardUrl = getSwitchboardGatewayUrlFromDriveUrl(driveUrl);
  const subgraph = kebabCase(documentModel.name);
  const encodedQuery = buildDocumentSubgraphQuery(
    driveUrl,
    documentId,
    documentModel,
  );
  return `${switchboardUrl}/${subgraph}?explorerURLState=${encodedQuery}`;
}
