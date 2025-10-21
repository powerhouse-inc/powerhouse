export function isDocumentTypeSupported(
  documentType: string,
  supportedDocuments: string[] | null | undefined,
): boolean {
  if (!supportedDocuments?.length) {
    return true;
  }

  return supportedDocuments.some((pattern) => {
    // Path wildcard: "powerhouse/*"
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      return documentType.startsWith(prefix + "/");
    }

    // Prefix wildcard: "power*"
    if (pattern.endsWith("*") && !pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return documentType.startsWith(prefix);
    }

    // Exact match
    return pattern === documentType;
  });
}
