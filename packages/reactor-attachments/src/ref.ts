import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import { InvalidAttachmentRef } from "./errors.js";

const REF_PATTERN = /^attachment:\/\/v(\d+):(.+)$/;
const DEFAULT_VERSION = 1;

export type ParsedRef = {
  version: number;
  hash: AttachmentHash;
};

export function parseRef(ref: AttachmentRef): ParsedRef {
  const match = REF_PATTERN.exec(ref);
  if (!match) {
    throw new InvalidAttachmentRef(ref);
  }
  return {
    version: Number(match[1]),
    hash: match[2],
  };
}

export function createRef(
  hash: AttachmentHash,
  version: number = DEFAULT_VERSION,
): AttachmentRef {
  return `attachment://v${version}:${hash}`;
}
