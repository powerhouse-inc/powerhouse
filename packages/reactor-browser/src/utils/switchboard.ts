import * as lzString from "lz-string";
import { GetDocumentWithOperationsDocument } from "../graphql/gen/schema.js";

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
  const loc = GetDocumentWithOperationsDocument.loc;
  if (!loc) {
    throw new Error(
      "GetDocumentWithOperationsDocument is misconfigured, loc is missing.",
    );
  }
  return loc.source.body;
}

export function buildDocumentSubgraphQuery(
  identifier: string,
  authToken?: string,
) {
  const query = getDocumentGraphqlQuery();
  const variables = { identifier };
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
  identifier: string,
  authToken?: string,
) {
  const encodedQuery = buildDocumentSubgraphQuery(identifier, authToken);
  return `${driveUrl}?explorerURLState=${encodedQuery}`;
}
