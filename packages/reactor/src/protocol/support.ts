import type {
  ProtocolSupport,
  ProtocolVersions,
} from "@powerhousedao/shared/document-model";
import { refusalFor } from "@powerhousedao/shared/document-model";

export type { ProtocolSupport };

/** The first stored version `support` registers its protocol without. */
export function firstUnsupportedProtocol(
  versions: ProtocolVersions | undefined,
  support: ProtocolSupport,
): { protocol: string; version: number } | undefined {
  return refusalFor(undefined, versions, support, []);
}
