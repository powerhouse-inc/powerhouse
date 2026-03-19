import type { Node } from "@powerhousedao/shared/document-drive";

export type GenerateNodesCopySrc = {
  srcId: Node["id"];
  targetName?: Node["name"];
  targetParentFolder?: Node["parentFolder"];
};

export type GenerateNodesCopyIdGenerator = (nodeToCopy: Node) => Node["id"];
