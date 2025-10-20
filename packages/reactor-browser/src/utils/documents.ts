export function isDocumentTypeSupported(
  documentType: string,
  supportedDocuments: string[] | "all" = [],
): boolean {
  if (supportedDocuments === "all") {
    return true;
  }

  return supportedDocuments.some((pattern) => {
    // Universal match
    if (pattern === "*") {
      return true;
    }

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
