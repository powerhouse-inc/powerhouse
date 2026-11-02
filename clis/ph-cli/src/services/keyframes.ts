import {
  KEYFRAME_ADMIN_OPERATIONS,
  type KeyframeCleanupRun,
  type KeyframeReclaim,
} from "@powerhousedao/reactor";
import { getConfig } from "@powerhousedao/shared/clis";
import { DEFAULT_SWITCHBOARD_PORT } from "@powerhousedao/shared/clis/constants";

export type KeyframesAction =
  | "preview"
  | "clean"
  | "status"
  | "cancel"
  | "reclaim";

export type KeyframesCommandArgs = {
  action: KeyframesAction;
  url?: string;
  token?: string;
  yes?: boolean;
  json?: boolean;
};

type GraphqlResponse<T> = {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
};

/** One call to the host's `inspection-admin` subgraph. */
export type KeyframesRequest = <T>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<T>;

export type KeyframesOutput = {
  out: (line: string) => void;
  err: (line: string) => void;
};

export type KeyframesDeps = {
  request: KeyframesRequest;
  output: KeyframesOutput;
  pollIntervalMs: number;
};

const POLL_INTERVAL_MS = 2_000;

/** The endpoint inspection-admin is mounted at, beside `/graphql`. */
export function keyframesEndpoint(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.endsWith("/inspection-admin")
    ? trimmed
    : `${trimmed}/inspection-admin`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** The result of a run as lines of text. */
export function runReport(run: KeyframeCleanupRun): string[] {
  const lines = [
    `${run.dryRun ? "Preview" : "Clean-up"}: ${run.state}, ${run.documentsSeen} of ${run.documentsTotal} documents`,
    `Keyframes: ${run.totals.rows} (${formatBytes(run.totals.bytes)}) in ${run.totals.streams} streams`,
    `${run.dryRun ? "Would remove" : "To remove"}: ${run.totals.removableRows} (${formatBytes(run.totals.removableBytes)})`,
  ];
  if (!run.dryRun) {
    lines.push(
      `Removed: ${run.totals.removedRows} (${formatBytes(run.totals.removedBytes)})`,
    );
  }
  if (run.error !== null) {
    lines.push(`Error: ${run.error}`);
  }
  if (run.reasons.length > 0) {
    lines.push("", "By reason:");
    for (const reason of run.reasons) {
      lines.push(
        `  ${reason.reason}: ${reason.rows} (${formatBytes(reason.bytes)})`,
      );
    }
  }
  if (run.types.length > 0) {
    lines.push("", "By document type:");
    for (const type of run.types) {
      lines.push(
        `  ${type.documentType} (interval ${type.interval}, keep ${type.keep ?? "all"}): ${type.rows} keyframes, ${formatBytes(type.bytes)}; remove ${type.removableRows}, ${formatBytes(type.removableBytes)}`,
      );
    }
  }
  if (run.topStreams.length > 0) {
    lines.push("", "Largest streams:");
    for (const stream of run.topStreams) {
      lines.push(
        `  ${stream.documentId} ${stream.scope}/${stream.branch} (${stream.documentType}, ${stream.reason}): remove ${stream.removableRows} of ${stream.rows}, ${formatBytes(stream.removableBytes)}`,
      );
    }
  }
  return lines;
}

function reclaimReport(reclaim: KeyframeReclaim): string[] {
  const lines = [`Reclaim: ${reclaim.state}`, reclaim.message];
  if (reclaim.tableBytesBefore !== null) {
    const after =
      reclaim.tableBytesAfter === null
        ? ""
        : ` to ${formatBytes(reclaim.tableBytesAfter)}`;
    lines.push(
      `Keyframe table: ${formatBytes(reclaim.tableBytesBefore)}${after}`,
    );
  }
  return lines;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function followRun(
  started: KeyframeCleanupRun,
  deps: KeyframesDeps,
): Promise<KeyframeCleanupRun> {
  let run = started;
  let reported = -1;
  while (run.state === "running") {
    if (run.documentsSeen !== reported) {
      reported = run.documentsSeen;
      deps.output.err(
        `${run.documentsSeen} of ${run.documentsTotal} documents, ${run.totals.removedRows} removed${run.parked ? " (paused: catch-up priority 0)" : ""}`,
      );
    }
    await sleep(deps.pollIntervalMs);
    const latest = await deps.request<{
      inspectionKeyframeCleanup: KeyframeCleanupRun | null;
    }>(KEYFRAME_ADMIN_OPERATIONS.cleanup);
    if (latest.inspectionKeyframeCleanup === null) {
      throw new Error("The host lost the run: did it restart?");
    }
    run = latest.inspectionKeyframeCleanup;
  }
  return run;
}

async function followReclaim(
  started: KeyframeReclaim,
  deps: KeyframesDeps,
): Promise<KeyframeReclaim> {
  let reclaim = started;
  while (reclaim.state === "running") {
    await sleep(deps.pollIntervalMs);
    const latest = await deps.request<{
      inspectionKeyframeReclaim: KeyframeReclaim | null;
    }>(KEYFRAME_ADMIN_OPERATIONS.reclaimStatus);
    if (latest.inspectionKeyframeReclaim === null) {
      throw new Error("The host lost the reclaim: did it restart?");
    }
    reclaim = latest.inspectionKeyframeReclaim;
  }
  return reclaim;
}

function printRun(
  run: KeyframeCleanupRun,
  args: KeyframesCommandArgs,
  deps: KeyframesDeps,
): void {
  if (args.json) {
    deps.output.out(JSON.stringify(run, null, 2));
    return;
  }
  for (const line of runReport(run)) deps.output.out(line);
}

function printReclaim(
  reclaim: KeyframeReclaim,
  args: KeyframesCommandArgs,
  deps: KeyframesDeps,
): void {
  if (args.json) {
    deps.output.out(JSON.stringify(reclaim, null, 2));
    return;
  }
  for (const line of reclaimReport(reclaim)) deps.output.out(line);
}

async function startAndFollow(
  dryRun: boolean,
  args: KeyframesCommandArgs,
  deps: KeyframesDeps,
): Promise<number> {
  const started = await deps.request<{
    inspectionStartKeyframeCleanup: KeyframeCleanupRun;
  }>(KEYFRAME_ADMIN_OPERATIONS.startCleanup, { dryRun });
  const run = await followRun(started.inspectionStartKeyframeCleanup, deps);
  printRun(run, args, deps);
  return run.state === "done" ? 0 : 1;
}

/** The action against a host, by way of `deps.request`. Answers the exit code. */
export async function executeKeyframesAction(
  args: KeyframesCommandArgs,
  deps: KeyframesDeps,
): Promise<number> {
  switch (args.action) {
    case "preview":
      return startAndFollow(true, args, deps);
    case "clean":
      if (!args.yes) {
        deps.output.err(
          "clean deletes keyframes. Run `ph keyframes preview` first, then add --yes.",
        );
        return 1;
      }
      return startAndFollow(false, args, deps);
    case "status": {
      const { inspectionKeyframeCleanup: run } = await deps.request<{
        inspectionKeyframeCleanup: KeyframeCleanupRun | null;
      }>(KEYFRAME_ADMIN_OPERATIONS.cleanup);
      const { inspectionKeyframeReclaim: reclaim } = await deps.request<{
        inspectionKeyframeReclaim: KeyframeReclaim | null;
      }>(KEYFRAME_ADMIN_OPERATIONS.reclaimStatus);
      if (args.json) {
        deps.output.out(JSON.stringify({ run, reclaim }, null, 2));
        return 0;
      }
      if (run === null) {
        deps.output.out("No clean-up has run since the host started.");
      } else {
        printRun(run, args, deps);
      }
      if (reclaim !== null) {
        printReclaim(reclaim, args, deps);
      }
      return 0;
    }
    case "cancel":
      await deps.request(KEYFRAME_ADMIN_OPERATIONS.cancelCleanup);
      deps.output.out(
        "The running clean-up stops after its current statement.",
      );
      return 0;
    case "reclaim": {
      if (!args.yes) {
        deps.output.err(
          "reclaim rewrites the Keyframe table; the store answers nothing while it does. Add --yes.",
        );
        return 1;
      }
      const started = await deps.request<{
        inspectionReclaimKeyframeSpace: KeyframeReclaim;
      }>(KEYFRAME_ADMIN_OPERATIONS.reclaim);
      const reclaim = await followReclaim(
        started.inspectionReclaimKeyframeSpace,
        deps,
      );
      printReclaim(reclaim, args, deps);
      return reclaim.state === "done" || reclaim.state === "unsupported"
        ? 0
        : 1;
    }
  }
}

/** A request against `endpoint` with `bearer`, refusing a GraphQL error. */
export function keyframesRequest(
  endpoint: string,
  bearer: string | undefined,
  fetchImpl: typeof fetch = fetch,
): KeyframesRequest {
  return async <T>(query: string, variables: Record<string, unknown> = {}) => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await response.text();
    let body: GraphqlResponse<T>;
    try {
      body = JSON.parse(text) as GraphqlResponse<T>;
    } catch {
      throw new Error(
        `${endpoint} answered ${response.status} without GraphQL. Is inspection-admin served (INSPECTION_ADMIN_ENABLED=true)?`,
      );
    }
    const failure = body.errors?.[0];
    if (failure) {
      const hint =
        failure.extensions?.code === "FORBIDDEN"
          ? " The caller must be one of the host's auth admins."
          : "";
      throw new Error(`${failure.message}${hint}`);
    }
    if (!body.data) {
      throw new Error(`${endpoint} answered ${response.status} with no data`);
    }
    return body.data;
  };
}

function defaultGraphqlUrl(): string {
  const port = getConfig().reactor?.port ?? DEFAULT_SWITCHBOARD_PORT;
  return `http://localhost:${port}/graphql`;
}

async function bearerToken(given: string | undefined): Promise<string> {
  const known = given ?? process.env.PH_ACCESS_TOKEN;
  if (known) return known;
  const { generateAccessToken } = await import("@renown/sdk/node");
  const { getRenown } = await import("./auth.js");
  const { token } = await generateAccessToken(await getRenown(), {
    expiresIn: 3600,
  });
  return token;
}

/** Runs `ph keyframes <action>`; answers the process exit code. */
export async function runKeyframesCommand(
  args: KeyframesCommandArgs,
): Promise<number> {
  const output: KeyframesOutput = {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  };
  try {
    const request = keyframesRequest(
      keyframesEndpoint(args.url ?? defaultGraphqlUrl()),
      await bearerToken(args.token),
    );
    return await executeKeyframesAction(args, {
      request,
      output,
      pollIntervalMs: POLL_INTERVAL_MS,
    });
  } catch (error) {
    output.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
