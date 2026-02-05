export function getDocumentType(documentTypes: string[]) {
  if (!documentTypes.length) return "*";
  return documentTypes.map((type) => `"${type}"`).join(", ");
}
