import type { TraceFiles } from "@powerhousedao/shared/build-pieces";
import { resolve } from "node:path";
import { nodeFileTrace } from "@vercel/nft";

// nft reports paths relative to its base; from "/" that is every path minus its root.
// One cache per build: the traces of a project's packages share most files.
export function createTraceFiles(): TraceFiles {
  const cache = {};
  return (file) => traceFile(file, cache);
}

export const traceFiles: TraceFiles = createTraceFiles();

async function traceFile(file: string, cache: object) {
  const { fileList, reasons } = await nodeFileTrace([file], {
    base: "/",
    cache,
  });
  const absolute = (p: string) => resolve("/", p);
  return {
    fileList: new Set([...fileList].map(absolute)),
    reasons: new Map(
      [...reasons].map(([p, reason]) => [
        absolute(p),
        { parents: new Set([...reason.parents].map(absolute)) },
      ]),
    ),
  };
}
