import type {
  DefinitionDiagnostic,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  isScalarDefinition,
  type ScalarDefinition,
} from "../../../scalars/types.js";
import { compareCodeUnits } from "../../kernel/primitives.js";
import type { DefinitionSourceLoader } from "../definition-source-loader.js";

/** Where codegen reads a package's `defineScalar` exports from. */
const PROJECT_SCALARS_SPECIFIER = "./scalars/index.ts";

/** The scalars `scalars/index.ts` exports, imported like the selected sources. */
export async function loadProjectScalars(request: {
  readonly loader: DefinitionSourceLoader;
  readonly packageRoot: string;
  readonly configFile: string;
  readonly packageRevision: Sha256Digest;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly definitions: readonly ScalarDefinition[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
}> {
  const { loader, packageRoot, configFile, packageRevision, signal } = request;
  if (!existsSync(join(packageRoot, "scalars", "index.ts"))) {
    return { definitions: [], diagnostics: [] };
  }
  const imported = await loader.importPackageModule({
    configFile,
    packageRevision,
    ...(signal !== undefined && { signal }),
    specifier: PROJECT_SCALARS_SPECIFIER,
  });
  if (!imported.ok) {
    return { definitions: [], diagnostics: imported.diagnostics };
  }
  // Codegen emits `import { <name> } from "scalars"`, so only an export bound
  // under the scalar's own name makes it available.
  const definitions = Object.entries(imported.namespace)
    .flatMap(([exportName, value]) =>
      isScalarDefinition(value) && value.name === exportName ? [value] : [],
    )
    .sort((left, right) => compareCodeUnits(left.name, right.name));
  return { definitions, diagnostics: [] };
}
