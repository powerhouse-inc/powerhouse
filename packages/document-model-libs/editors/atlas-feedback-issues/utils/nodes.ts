import { RawViewNode, ViewNode } from "@powerhousedao/mips-parser";

export function filterViewNodesRecursively(
  nodes: ViewNode[],
  slugSuffixes: string[],
): ViewNode[] {
  const filteredNodes: ViewNode[] = [];

  for (const node of nodes) {
    // Check if current node matches
    const isCurrentNodeMatch = slugSuffixes.includes(node.slugSuffix);

    // Recursively filter subdocuments
    const filteredSubDocuments = filterViewNodesRecursively(
      node.subDocuments,
      slugSuffixes,
    );

    if (isCurrentNodeMatch) {
      // If current node matches, include it with filtered subdocuments
      filteredNodes.push({
        ...node,
        subDocuments: filteredSubDocuments,
      });
    } else if (filteredSubDocuments.length > 0) {
      // If current node doesn't match but has matching descendants,
      // add the matching descendants directly to the result
      filteredNodes.push(...filteredSubDocuments);
    }
  }

  return filteredNodes;
}
export function makeViewNodeTitleText(node: RawViewNode): string {
  const { formalId, title, typeSuffix } = node.title;
  const { prefix, numberPath } = formalId;
  const numberPathString = numberPath.join(".");
  const typeSuffixString = typeSuffix ? ` - ${typeSuffix}` : "";

  return `${prefix}.${numberPathString} - ${title}${typeSuffixString}`;
}
