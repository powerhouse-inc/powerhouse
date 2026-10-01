// Publish a piece, read it everywhere until it shows, then bump the version and
// see whether every reader agrees on `latest` before and after exact reads.
import { pieceEndpoints, pkgPrefix, type Context } from "../lib/context.js";
import { poll, type PollResult } from "../lib/poll.js";
import {
  probePackage,
  publishProbe,
  type PublishRecord,
} from "../lib/publisher.js";
import { log } from "../lib/sh.js";

export interface VisibilityResult {
  name: string;
  piece: string;
  publishes: PublishRecord[];
  /** v1.0.0: latest, exact and bundle. */
  first: PollResult;
  /** After v1.0.1: `latest` alone, so nothing asks for 1.0.1 by version. */
  latestOnly: PollResult;
  /** Then exact and bundle reads of 1.0.1, and `latest` again; timed from its own start. */
  bumped: PollResult;
}

export async function visibility(ctx: Context): Promise<VisibilityResult> {
  const { timing } = ctx;
  const name = pkgPrefix(ctx.runId);
  const v1 = probePackage(name, "1.0.0");
  const v2 = probePackage(name, "1.0.1");

  const pub1 = await publishProbe(v1, ctx.publishUrl(0), ctx.token);
  if (!pub1.ok) throw new Error(`publish ${name}@1.0.0 failed`);
  log(`visibility: reading ${v1.piece}@1.0.0`);
  const first = await poll({
    targets: ctx.targets,
    endpoints: pieceEndpoints(v1.piece, "1.0.0", {
      latest: true,
      expectLatest: "1.0.0",
    }),
    since: pub1.finishedAt,
    timeoutMs: timing.visibleTimeoutMs,
    holdMs: timing.holdMs,
    intervalMs: timing.intervalMs,
  });
  log(`visibility: 1.0.0 everywhere after ${first.allOkMs ?? "never"} ms`);

  const pub2 = await publishProbe(v2, ctx.publishUrl(0), ctx.token);
  if (!pub2.ok) throw new Error(`publish ${name}@1.0.1 failed`);
  const latestOnly = await poll({
    targets: ctx.targets,
    endpoints: [
      { key: "latest", path: `/pieces/${v2.piece}`, expectVersion: "1.0.1" },
    ],
    since: pub2.finishedAt,
    timeoutMs: timing.latestTimeoutMs,
    holdMs: timing.holdMs,
    intervalMs: timing.intervalMs,
  });
  log(
    `visibility: latest=1.0.1 everywhere after ${latestOnly.allOkMs ?? "never"} ms`,
  );

  const bumped = await poll({
    targets: ctx.targets,
    endpoints: [
      ...pieceEndpoints(v2.piece, "1.0.1", {
        latest: true,
        expectLatest: "1.0.1",
      }),
      ...pieceEndpoints(v1.piece, "1.0.0"),
    ],
    since: Date.now(),
    timeoutMs: timing.visibleTimeoutMs,
    holdMs: timing.holdMs,
    intervalMs: timing.intervalMs,
  });
  log(`visibility: 1.0.1 everywhere after ${bumped.allOkMs ?? "never"} ms`);

  return {
    name,
    piece: v1.piece,
    publishes: [pub1, pub2],
    first,
    latestOnly,
    bumped,
  };
}
