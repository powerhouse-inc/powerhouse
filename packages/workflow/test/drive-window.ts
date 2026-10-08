// The browser globals the AI tools read: the selected drive, the reactor
// client and the sync manager, holding one gql remote per synced drive.
import { DriveCollectionId } from "@powerhousedao/reactor";
import { vi } from "vitest";

export function installDriveWindow(options: {
  selectedDriveId: string;
  // Drive id to its switchboard's gql channel URL (`<origin>/graphql/r`).
  remotes?: Record<string, string>;
  reactorClient?: unknown;
}): void {
  const syncManager = {
    list: () =>
      Object.entries(options.remotes ?? {}).map(([driveId, url]) => ({
        meta: {
          collectionId: DriveCollectionId.forDrive(driveId),
          channelConfig: { type: "gql", parameters: { url } },
        },
      })),
  };
  vi.stubGlobal("window", {
    ph: {
      selectedDriveId: options.selectedDriveId,
      reactorClient: options.reactorClient,
      reactorClientModule: { reactorModule: { syncModule: { syncManager } } },
    },
  });
}
