import * as lzString from "lz-string";

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

export function getDocumentGraphqlQuery() {
  return `query getDocument($documentId: String!) {
  document(id: $documentId) {
      id
      lastModified
      name
      revision
      stateJSON
    }
  }`;
}

export function buildDocumentSubgraphQuery(
  driveUrl: string,
  documentId: string,
  authToken?: string,
) {
  const driveSlug = getSlugFromDriveUrl(driveUrl);
  const query = getDocumentGraphqlQuery();
  const variables = { documentId, driveId: driveSlug };
  const headers = authToken
    ? {
        Authorization: `Bearer ${authToken}`,
      }
    : undefined;

  const payload: Record<string, string> = {
    document: query.trim(),
    variables: JSON.stringify(variables, null, 2),
  };
  if (headers) {
    payload.headers = JSON.stringify(headers);
  }
  return lzString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function buildDocumentSubgraphUrl(
  driveUrl: string,
  documentId: string,
  authToken?: string,
) {
  const encodedQuery = buildDocumentSubgraphQuery(
    driveUrl,
    documentId,
    authToken,
  );
  return `${driveUrl}?explorerURLState=${encodedQuery}`;
}
