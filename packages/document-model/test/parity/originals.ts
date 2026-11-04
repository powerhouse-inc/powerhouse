import type {
  DocumentModelGlobalState,
  DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import {
  createState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NormalizedDocumentModelArtifact } from "../../src/definition/tooling/adapters/types.js";
import { adaptSchemaFirstDocumentModelModule } from "../../src/definition/tooling/schema-first/schema-first-document-model-module-adapter.js";

export const REPO_ROOT = fileURLToPath(
  new URL("../../../../", import.meta.url),
);

function readOriginal(path: string): DocumentModelPHState {
  const stored = JSON.parse(readFileSync(REPO_ROOT + path, "utf8")) as
    | DocumentModelGlobalState
    | { readonly state: { readonly global: DocumentModelGlobalState } };
  const global = "state" in stored ? stored.state.global : stored;
  return createState(defaultBaseState(), global);
}

export function adaptOriginal(
  path: string,
  version: number,
): NormalizedDocumentModelArtifact {
  const result = adaptSchemaFirstDocumentModelModule(
    readOriginal(path),
    { specifier: `./${path}` },
    { version },
  );
  if (result.artifacts.length !== 1 || result.diagnostics.length > 0) {
    throw new Error(
      `${path} v${version} did not adapt: ${result.diagnostics
        .map(({ code, message }) => `${code} ${message}`)
        .join("; ")}`,
    );
  }
  return result.artifacts[0];
}
