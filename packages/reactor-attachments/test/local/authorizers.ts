import type {
  AttachmentPeerLink,
  LocalAttachmentAuthorizer,
} from "../../src/local/index.js";
import type { IAttachmentReferenceReader } from "../../src/read-models/attachment-reference/types.js";
import { createRef } from "../../src/ref.js";

export const TEST_LINK: AttachmentPeerLink = {
  peerId: "peer",
  channelName: "attachments",
};

/** Reference-only: trusts every link. Test fixture, never a host default. */
export function byReference(
  reader: Pick<IAttachmentReferenceReader, "hasReference">,
): LocalAttachmentAuthorizer {
  return (_link, hash, documentId) =>
    reader.hasReference(documentId, createRef(hash));
}
