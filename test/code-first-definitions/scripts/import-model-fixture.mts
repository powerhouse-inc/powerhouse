#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { canonicalJson, sha256 } from "../src/evidence/utils.js";

const [sourcePath, exportName] = process.argv.slice(2);
if (!sourcePath || !exportName) {
  throw new Error("A source path and export name are required.");
}

const imported = (await import(pathToFileURL(sourcePath).href)) as Record<
  string,
  unknown
>;
const candidate = imported[exportName] as
  | {
      readonly version?: number;
      readonly definition?: unknown;
      readonly documentModel?: unknown;
    }
  | undefined;
if (
  !candidate ||
  candidate.definition === undefined ||
  candidate.documentModel === undefined
) {
  throw new Error(`${exportName} is not a finalized code-first model module.`);
}

const payload = canonicalJson({
  version: candidate.version,
  definition: candidate.definition,
  documentModel: candidate.documentModel,
});
process.stdout.write(`${JSON.stringify({ digest: sha256(payload) })}\n`);
