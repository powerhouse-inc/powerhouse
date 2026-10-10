export {
  buildAttachmentModule,
  TRUST_OWN_PEERS,
  type AttachmentModule,
  type BuildAttachmentModuleOptions,
} from "./attachment-module.js";
export {
  linkLocalAttachments,
  type AttachmentLinkHandle,
  type LinkAttachmentsOptions,
} from "./link.js";
export type {
  AdoptAttachmentPeerLink,
  ManagedAttachments,
  ReactorAttachmentsConfig,
} from "./types.js";
export type { AttachmentServedStats } from "@powerhousedao/reactor-attachments/replication";
