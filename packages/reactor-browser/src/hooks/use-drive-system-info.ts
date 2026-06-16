import {
  DriveCollectionId,
  type GqlRequestChannel,
} from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { useEffect, useMemo, useState } from "react";
import { useSyncList } from "./reactor.js";

export type DriveSystemInfoState =
  | { status: "local" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      version: string;
      gitHash: string;
      gitUrl: string | null;
      host: string;
    };

export function deriveSystemUrl(channelUrl: string): string | null {
  try {
    const url = new URL(channelUrl);
    url.search = "";
    url.hash = "";
    const suffix = "/graphql/r";
    if (url.pathname.endsWith(suffix)) {
      url.pathname = url.pathname.slice(0, -suffix.length) + "/graphql/system";
    } else {
      url.pathname = "/graphql/system";
    }
    return url.toString();
  } catch {
    return null;
  }
}

const cache = new Map<string, DriveSystemInfoState>();

export function useDriveSystemInfo(
  drive: DocumentDriveDocument | undefined,
): DriveSystemInfoState {
  const remotes = useSyncList();
  const driveId = drive?.header.id;

  const systemUrl = useMemo(() => {
    if (!driveId) return null;
    const remote = remotes.find((r) =>
      r.collectionId.equals(DriveCollectionId.forDrive(driveId)),
    );
    const channelUrl = (remote?.channel as GqlRequestChannel | undefined)
      ?.config.url;
    if (typeof channelUrl !== "string") return null;
    return deriveSystemUrl(channelUrl);
  }, [remotes, driveId]);

  const [state, setState] = useState<DriveSystemInfoState>(() =>
    systemUrl
      ? (cache.get(systemUrl) ?? { status: "loading" })
      : { status: "local" },
  );

  useEffect(() => {
    if (!systemUrl) {
      setState({ status: "local" });
      return;
    }

    const cached = cache.get(systemUrl);
    if (cached && cached.status !== "loading") {
      setState(cached);
      return;
    }

    setState({ status: "loading" });
    cache.set(systemUrl, { status: "loading" });

    const controller = new AbortController();
    fetch(systemUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "{ system { version gitHash gitUrl } }",
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          data?: {
            system?: {
              version: string;
              gitHash: string;
              gitUrl: string | null;
            };
          };
          errors?: Array<{ message: string }>;
        };
        if (json.errors?.length) {
          throw new Error(json.errors.map((e) => e.message).join("; "));
        }
        const sys = json.data?.system;
        if (!sys) throw new Error("Missing system in response");
        const next: DriveSystemInfoState = {
          status: "ready",
          version: sys.version,
          gitHash: sys.gitHash,
          gitUrl: sys.gitUrl ?? null,
          host: new URL(systemUrl).host,
        };
        cache.set(systemUrl, next);
        setState(next);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        const next: DriveSystemInfoState = { status: "error", message };
        cache.set(systemUrl, next);
        setState(next);
      });

    return () => controller.abort();
  }, [systemUrl]);

  return state;
}
