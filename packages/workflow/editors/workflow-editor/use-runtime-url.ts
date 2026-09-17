// Resolves the workflow-runtime subgraph URL for the selected drive:
// remote sync channel, then vetra default-drive URL, then the default.
import {
  DriveCollectionId,
  type GqlRequestChannel,
} from "@powerhousedao/reactor";
import {
  DEFAULT_SWITCHBOARD_URL,
  parseDriveUrl,
  subgraphUrlFromGraphqlUrl,
  useDefaultDrivesUrl,
  useSelectedDriveSafe,
  useSyncList,
} from "@powerhousedao/reactor-browser";
import { useEffect, useMemo } from "react";
import { setRuntimeUrl } from "./runtime-api.js";

const SUBGRAPH_NAME = "workflow-runtime";

// Channel URLs end in /graphql/r; strip only that suffix so a proxy
// sub-path in the base survives.
function baseFromChannelUrl(channelUrl: string): string | undefined {
  try {
    const url = new URL(channelUrl);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/r\/?$/, "");
    return url.toString();
  } catch {
    return undefined;
  }
}

export function useWorkflowRuntimeUrl(): string {
  const [drive] = useSelectedDriveSafe();
  const remotes = useSyncList();
  const defaultDrivesUrl = useDefaultDrivesUrl();
  const driveId = drive?.header.id;

  return useMemo(() => {
    let base: string | undefined;
    if (driveId) {
      const remote = remotes.find((entry) =>
        entry.meta.collectionId.equals(DriveCollectionId.forDrive(driveId)),
      );
      const channelUrl = (remote?.channel as GqlRequestChannel | undefined)
        ?.config.url;
      if (typeof channelUrl === "string") {
        base = baseFromChannelUrl(channelUrl);
      }
    }
    // Local drive: under `ph vetra` the switchboard is still reachable
    // through the default drive URL.
    if (!base && defaultDrivesUrl) {
      try {
        base = parseDriveUrl(defaultDrivesUrl).graphqlEndpoint.replace(
          /\/r$/,
          "",
        );
      } catch {
        // Malformed default drive URL; fall through to the constant.
      }
    }
    return subgraphUrlFromGraphqlUrl(
      base ?? DEFAULT_SWITCHBOARD_URL,
      SUBGRAPH_NAME,
    );
  }, [driveId, remotes, defaultDrivesUrl]);
}

// Publishes the resolved URL to the module-level client used outside React.
export function useSyncWorkflowRuntimeUrl(): void {
  const url = useWorkflowRuntimeUrl();
  useEffect(() => {
    setRuntimeUrl(url);
  }, [url]);
}
