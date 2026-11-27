import type { TraceFiles } from "@powerhousedao/shared/build-pieces";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { nodeFileTrace } from "@vercel/nft";

// nft reports paths relative to its base; from "/" that is every path minus its root.
// One cache per build: the traces of a project's packages share most files.
export function createTraceFiles(): TraceFiles {
  const cache = {};
  return (file) => traceFile(file, cache);
}

export const traceFiles: TraceFiles = createTraceFiles();

// nft reads a file with no extension as a script, and code outside
// node_modules can name any file of the machine: a workspace package that
// calls `fs.existsSync("/usr/bin/chromium")` made it read a browser larger
// than a string can hold. A binary is no script. The test is git's: a NUL
// byte in the first 8000 bytes.
function isBinaryFile(file: string): boolean {
  let fd: number | undefined;
  try {
    if (!statSync(file).isFile()) return false;
    fd = openSync(file, "r");
    const head = Buffer.alloc(8000);
    const length = readSync(fd, head, 0, head.length, 0);
    return head.subarray(0, length).includes(0);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

async function traceFile(file: string, cache: object) {
  const { fileList, reasons } = await nodeFileTrace([file], {
    base: "/",
    cache,
    ignore: (path) => extname(path) === "" && isBinaryFile(resolve("/", path)),
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
