import type { Endpoint, Target } from "./poll.js";
import { bundleFile } from "./publisher.js";
import type { Stack } from "./stack.js";

export interface Timing {
  intervalMs: number;
  /** How long a first publish may take to show up everywhere. */
  visibleTimeoutMs: number;
  /** Reads after everything was ok, to catch flips back to 404. */
  holdMs: number;
  /** How long only `latest` is read after a bump, before exact reads extract it. */
  latestTimeoutMs: number;
  listTimeoutMs: number;
}

export interface Context {
  mode: "docker" | "dev";
  label: string;
  /** Unique per run; every package name carries it. */
  runId: string;
  token: string;
  /** Where the i-th publish goes. */
  publishUrl: (i: number) => string;
  /** Where visibility is read from. */
  targets: Target[];
  /** Where package listings are read from. */
  listTargets: Target[];
  timing: Timing;
  stack?: Stack;
}

export const pkgPrefix = (runId: string) => `registry-e2e-cache-${runId}`;

export function pieceEndpoints(
  piece: string,
  version: string,
  options: { latest?: boolean; expectLatest?: string } = {},
): Endpoint[] {
  const endpoints: Endpoint[] = [];
  if (options.latest) {
    endpoints.push({
      key: "latest",
      path: `/pieces/${piece}`,
      ...(options.expectLatest ? { expectVersion: options.expectLatest } : {}),
    });
  }
  endpoints.push(
    { key: `exact@${version}`, path: `/pieces/${piece}?version=${version}` },
    {
      key: `bundle@${version}`,
      path: `/-/pieces/bundled/${bundleFile(piece, version)}`,
    },
  );
  return endpoints;
}
