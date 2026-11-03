// The switchboards an app reaches, and the one a call should go to. Hosts
// build the directory once at boot (createSwitchboardDirectory) and set it on
// their store; callers ask resolveSwitchboard, which never guesses a URL.
import { DriveCollectionId, type ISyncManager } from "@powerhousedao/reactor";
import { ORIGIN_PLACEHOLDER } from "@powerhousedao/shared/connect/origin-placeholder";
import { switchboardOfDrive } from "@powerhousedao/shared/host-tokens";
import type {
  SwitchboardDirectory,
  SwitchboardEntry,
  SwitchboardWorkflows,
} from "../types/switchboards.js";
import { getSwitchboardBaseFromChannelUrl } from "./switchboard.js";

/** What a router says about its backends; structural, so hosts pass their own. */
export interface SwitchboardRouter {
  readonly backends: readonly {
    readonly name: string;
    readonly facts: {
      readonly known: boolean;
      readonly reactor: { readonly workflows: boolean };
    };
  }[];
  /** The name of the backend that serves `identifier`. */
  locate(identifier: string, signal?: AbortSignal): Promise<string>;
}

export interface SwitchboardDirectoryOptions {
  /**
   * The host's remote backends, as the served config lists them
   * (`instance.remoteBackends`): a name and one of the switchboard's drive
   * addresses, `<base>/d/<slug>`.
   */
  remoteBackends?: readonly { readonly name: string; readonly url: string }[];
  /** The router over those backends, for their facts and for `locate`. */
  router?: SwitchboardRouter;
  /** The tab's sync manager, read on each call: every gql remote's switchboard. */
  syncManager?: () => Pick<ISyncManager, "list"> | undefined;
  /** What `${origin}` stands for; defaults to the page's origin. */
  origin?: string;
}

/** `${origin}` resolved against the page; a base stays as it is otherwise. */
function resolveOrigin(base: string, origin: string | undefined): string {
  if (!base.startsWith(ORIGIN_PLACEHOLDER)) return base;
  const page =
    origin ?? (typeof location === "undefined" ? undefined : location.origin);
  return page ? page + base.slice(ORIGIN_PLACEHOLDER.length) : base;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** A synced drive's switchboard, named by its host and path. */
function syncName(base: string): string {
  return base.replace(/^[a-z]+:\/\//i, "");
}

/**
 * Builds the directory from the host's remote backends and the tab's synced
 * drives. A backend's facts are read on each `list`, so a refresh shows.
 */
export function createSwitchboardDirectory(
  options: SwitchboardDirectoryOptions,
): SwitchboardDirectory {
  const backends = (options.remoteBackends ?? []).flatMap(({ name, url }) => {
    const drive = switchboardOfDrive(url);
    if (!drive) return [];
    const base = trimSlash(resolveOrigin(drive.base, options.origin));
    return [{ name, base }];
  });

  const workflowsOf = (name: string): SwitchboardWorkflows => {
    const backend = options.router?.backends.find((b) => b.name === name);
    if (!backend?.facts.known) return "unknown";
    return backend.facts.reactor.workflows;
  };

  const remotes = () => {
    try {
      return options.syncManager?.()?.list() ?? [];
    } catch {
      return [];
    }
  };

  const syncBase = (remote: ReturnType<typeof remotes>[number]) => {
    const { channelConfig } = remote.meta;
    const url =
      channelConfig.type === "gql" ? channelConfig.parameters.url : "";
    if (typeof url !== "string" || !url) return undefined;
    try {
      return trimSlash(getSwitchboardBaseFromChannelUrl(url));
    } catch {
      return undefined;
    }
  };

  const list = (): SwitchboardEntry[] => {
    const entries: SwitchboardEntry[] = backends.map(({ name, base }) => ({
      name,
      base,
      graphqlUrl: `${base}/graphql`,
      via: "backend",
      workflows: workflowsOf(name),
    }));
    const seen = new Set(entries.map((entry) => entry.base));
    for (const remote of remotes()) {
      const base = syncBase(remote);
      if (!base || seen.has(base)) continue;
      seen.add(base);
      entries.push({
        name: syncName(base),
        base,
        graphqlUrl: `${base}/graphql`,
        via: "sync",
        workflows: "unknown",
      });
    }
    return entries;
  };

  const locate = async (
    documentId: string,
    signal?: AbortSignal,
  ): Promise<SwitchboardEntry | undefined> => {
    const entries = list();
    const collectionId = DriveCollectionId.forDrive(documentId);
    const remote = remotes().find((r) =>
      r.meta.collectionId.equals(collectionId),
    );
    const synced = remote && syncBase(remote);
    if (synced) return entries.find((entry) => entry.base === synced);
    if (!options.router || backends.length === 0) return undefined;
    let name: string;
    try {
      name = await options.router.locate(documentId, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      return undefined;
    }
    return entries.find(
      (entry) => entry.via === "backend" && entry.name === name,
    );
  };

  return { list, locate };
}

export type SwitchboardLookupErrorCode =
  | "NO_DIRECTORY"
  | "NO_SWITCHBOARD"
  | "UNKNOWN_SWITCHBOARD"
  | "AMBIGUOUS_SWITCHBOARD"
  | "NO_WORKFLOW_RUNTIME";

/** Why no switchboard could be picked, with the ones there are. */
export class SwitchboardLookupError extends Error {
  constructor(
    message: string,
    readonly code: SwitchboardLookupErrorCode,
    readonly switchboards: readonly SwitchboardEntry[] = [],
  ) {
    super(message);
    this.name = "SwitchboardLookupError";
  }
}

export interface SwitchboardRequest {
  /** A name from the directory, or a URL on the switchboard (its base, GraphQL or any path under it). */
  switchboard?: string;
  /** The document or drive the call is about: its switchboard, when the directory can place it. */
  documentId?: string;
  /** What the switchboard must run. */
  need?: "workflows";
  signal?: AbortSignal;
}

function describe(entry: SwitchboardEntry): string {
  const workflows =
    entry.workflows === "unknown"
      ? "workflows unknown"
      : entry.workflows
        ? "runs workflows"
        : "no workflows";
  return `${entry.name} (${entry.base}, ${workflows})`;
}

function describeAll(entries: readonly SwitchboardEntry[]): string {
  return entries.map(describe).join("; ");
}

/** The entry `switchboard` names: by name, then by the longest base it lies under. */
function byNameOrUrl(
  entries: readonly SwitchboardEntry[],
  switchboard: string,
): SwitchboardEntry | undefined {
  const named = entries.find((entry) => entry.name === switchboard);
  if (named) return named;
  const url = trimSlash(switchboard);
  return entries
    .filter((entry) => url === entry.base || url.startsWith(`${entry.base}/`))
    .sort((a, b) => b.base.length - a.base.length)[0];
}

function checkNeed(
  entry: SwitchboardEntry,
  need: SwitchboardRequest["need"],
  entries: readonly SwitchboardEntry[],
): SwitchboardEntry {
  if (need === "workflows" && entry.workflows === false) {
    throw new SwitchboardLookupError(
      `Switchboard ${entry.name} (${entry.base}) runs no workflow runtime.`,
      "NO_WORKFLOW_RUNTIME",
      entries,
    );
  }
  return entry;
}

/**
 * The switchboard a call goes to: the one named, else the one serving the
 * document, else the only one there is (or the only one running what `need`
 * asks for). Throws a {@link SwitchboardLookupError} that lists the
 * switchboards whenever it can't pick one; there is no default URL.
 */
export async function resolveSwitchboard(
  directory: SwitchboardDirectory | undefined,
  request: SwitchboardRequest = {},
): Promise<SwitchboardEntry> {
  if (!directory) {
    throw new SwitchboardLookupError(
      "This app provides no switchboard directory, so no switchboard can be picked.",
      "NO_DIRECTORY",
    );
  }
  const entries = directory.list();
  const { need } = request;

  if (request.switchboard) {
    const named = byNameOrUrl(entries, request.switchboard);
    if (!named) {
      throw new SwitchboardLookupError(
        entries.length > 0
          ? `No switchboard "${request.switchboard}". This app reaches: ${describeAll(entries)}.`
          : `No switchboard "${request.switchboard}": this app reaches no switchboard.`,
        "UNKNOWN_SWITCHBOARD",
        entries,
      );
    }
    return checkNeed(named, need, entries);
  }

  // With one switchboard, placing the document could only name that one.
  if (request.documentId && entries.length > 1) {
    const located = await directory.locate(request.documentId, request.signal);
    if (located) return checkNeed(located, need, entries);
  }

  if (entries.length === 0) {
    throw new SwitchboardLookupError(
      "This app reaches no switchboard; it is connected to none.",
      "NO_SWITCHBOARD",
    );
  }
  if (entries.length === 1) return checkNeed(entries[0], need, entries);

  if (need === "workflows") {
    const running = entries.filter((entry) => entry.workflows === true);
    if (running.length === 1) return running[0];
    if (running.length === 0) {
      const maybe = entries.filter((entry) => entry.workflows === "unknown");
      if (maybe.length === 1) return maybe[0];
      if (maybe.length === 0) {
        throw new SwitchboardLookupError(
          `None of the switchboards runs a workflow runtime: ${describeAll(entries)}.`,
          "NO_WORKFLOW_RUNTIME",
          entries,
        );
      }
    }
  }
  throw new SwitchboardLookupError(
    `This app reaches several switchboards (${describeAll(entries)}); name one with "switchboard".`,
    "AMBIGUOUS_SWITCHBOARD",
    entries,
  );
}
