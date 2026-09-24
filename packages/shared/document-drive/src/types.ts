import type {
  DocumentDriveLocalState,
  Node,
} from "@powerhousedao/shared/document-drive";

export type GenerateNodesCopySrc = {
  srcId: Node["id"];
  targetName?: Node["name"];
  targetParentFolder?: Node["parentFolder"];
};

export type GenerateNodesCopyIdGenerator = (nodeToCopy: Node) => Node["id"];

export type DriveInput = {
  global: {
    name: string;
    icon?: string | null;
  };
  id?: string;
  slug?: string;
  preferredEditor?: string;
  local?: Partial<DocumentDriveLocalState>;
  /** Merged over the drive's defaults; `signature: 2` makes it v2-required. */
  protocolVersions?: { [protocol: string]: number };
};

export type SharingType = "LOCAL" | "CLOUD" | "PUBLIC";
