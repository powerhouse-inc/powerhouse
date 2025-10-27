import type { PHDocument } from "document-model";
import { useMemo } from "react";
import {
  buildDocumentSubgraphUrl,
  getDriveIsRemote,
  getDriveRemoteUrl,
} from "../utils/index.js";
import { useConnectCrypto, useUser } from "./connect.js";
import { useDriveByDocumentId } from "./drive-by-document-id.js";

/**
 * Hook that returns a function to generate a document's switchboard URL.
 * Only returns a function for documents in remote drives.
 * Returns null for local drives or when the document/drive cannot be determined.
 *
 * The returned function generates a fresh bearer token and builds the switchboard URL
 * with authentication when called.
 *
 * @param document - The document to create a switchboard URL generator for
 * @returns An async function that returns the switchboard URL, or null if not applicable
 */
export function useGetSwitchboardLink(
  document: PHDocument | undefined,
): (() => Promise<string>) | null {
  const drive = useDriveByDocumentId(document?.header.id);
  const isRemoteDrive = getDriveIsRemote(drive);
  const remoteUrl = getDriveRemoteUrl(drive);
  const connectCrypto = useConnectCrypto();
  const user = useUser();

  return useMemo(() => {
    if (!isRemoteDrive || !document?.header.id || !remoteUrl) {
      return null;
    }

    return async () => {
      // Get bearer token if user is authenticated
      const token = user?.address
        ? await connectCrypto?.getBearerToken(remoteUrl, user.address, false, {
            expiresIn: 600,
          })
        : undefined;

      // Build and return the switchboard URL with the document subgraph query
      return buildDocumentSubgraphUrl(remoteUrl, document.header.id, token);
    };
  }, [isRemoteDrive, remoteUrl, document, user, connectCrypto]);
}
