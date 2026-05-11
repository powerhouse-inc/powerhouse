export interface ParsedDriveUrl {
  url: string;
  driveId: string;
  graphqlEndpoint: string;
}

/**
 * Parse a drive URL to extract drive ID and construct GraphQL endpoint.
 * Preserves any subpath prefix so the result is correct when the reactor is
 * served behind a proxy at a non-root path.
 * e.g., "http://localhost:4001/d/abc123" -> { driveId: "abc123", graphqlEndpoint: "http://localhost:4001/graphql/r" }
 * e.g., "https://example.com/api/reactor/d/abc123" -> { ..., graphqlEndpoint: "https://example.com/api/reactor/graphql/r" }
 */
export function parseDriveUrl(url: string): ParsedDriveUrl {
  const parsedUrl = new URL(url);
  const driveId = url.split("/").pop() ?? "";
  const basePath = parsedUrl.pathname.replace(/\/d\/[^/]+\/?$/, "");
  const graphqlEndpoint = `${parsedUrl.protocol}//${parsedUrl.host}${basePath}/graphql/r`;
  return { url, driveId, graphqlEndpoint };
}

/**
 * Extract drive ID from a drive URL.
 */
export function driveIdFromUrl(url: string): string {
  return url.split("/").pop() ?? "";
}
