import { driveCollectionId, GqlChannel } from "@powerhousedao/reactor";
import type { PHDocument } from "document-model";
import { useMemo } from "react";
import { buildDocumentSubgraphUrl } from "../utils/index.js";
import { useRenown, useSyncList, useUser } from "./connect.js";
import { useSelectedDrive } from "./selected-drive.js";

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
  const [drive] = useSelectedDrive();
  const { data: remotes = [] } = useSyncList();

  const isRemoteDrive = useMemo(() => {
    return remotes.some(
      (remote) =>
        remote.collectionId === driveCollectionId("main", drive.header.id),
    );
  }, [remotes, drive]);
  const remoteUrl = useMemo(() => {
    const remote = remotes.find(
      (remote) =>
        remote.collectionId === driveCollectionId("main", drive.header.id),
    );

    if (remote?.channel instanceof GqlChannel) {
      return (remote.channel as GqlChannel).config.url;
    }

    return null;
  }, [remotes, drive]);
  const renown = useRenown();
  const user = useUser();

  return useMemo(() => {
    if (!isRemoteDrive || !document?.header.id || !remoteUrl) {
      return null;
    }

    return async () => {
      // Get bearer token if user is authenticated
      const token = user?.address
        ? await renown?.getBearerToken({
            expiresIn: 600,
            aud: remoteUrl,
          })
        : undefined;

      // Build and return the switchboard URL with the document subgraph query
      return buildDocumentSubgraphUrl(remoteUrl, document.header.id, token);
    };
  }, [isRemoteDrive, remoteUrl, document, user, renown]);
}
