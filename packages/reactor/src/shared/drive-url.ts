export interface ParsedDriveUrl {
  url: string;
  driveId: string;
  graphqlEndpoint: string;
}

/**
 * Parse a drive URL to extract drive ID and construct GraphQL endpoint.
 * e.g., "http://localhost:4001/d/abc123" -> { driveId: "abc123", graphqlEndpoint: "http://localhost:4001/graphql/r/local" }
 */
export function parseDriveUrl(url: string): ParsedDriveUrl {
  const parsedUrl = new URL(url);
  const driveId = url.split("/").pop() ?? "";
  const graphqlEndpoint = `${parsedUrl.protocol}//${parsedUrl.host}/graphql/r/local`;
  return { url, driveId, graphqlEndpoint };
}

/**
 * Extract drive ID from a drive URL.
 */
export function driveIdFromUrl(url: string): string {
  return url.split("/").pop() ?? "";
}
