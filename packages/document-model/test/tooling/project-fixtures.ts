import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkProjectDefinitions } from "../../src/definition/tooling/check/check-project-definitions.js";
import { DefinitionSourceLoader } from "../../src/definition/tooling/definition-source-loader.js";
import type { TypeScriptSourceImportInterface } from "../../src/definition/tooling/definition-source-types.js";
import type { DefinitionProducer } from "../../src/definition/tooling/adapters/producer.js";
import {
  loadProjectDefinitions,
  type ProjectDefinitions,
} from "../../src/definition/tooling/project/project-definitions.js";
import {
  materializeFixturePackage,
  packageRevisionOf,
} from "./loader-contract.js";

/** Imports from the package itself, so Node errors quote its root. */
const directImporter: TypeScriptSourceImportInterface = {
  importModule: async ({ packageRoot, specifier }) =>
    (await import(
      pathToFileURL(join(packageRoot, specifier)).href
    )) as Readonly<Record<string, unknown>>,
};

export function writeFiles(
  root: string,
  files: Readonly<Record<string, string>>,
): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

export type LoadedFixture = {
  readonly root: string;
  readonly project: ProjectDefinitions;
  readonly report: DefinitionCheckReport;
};

export async function loadFixture(
  fixture: string,
  options: {
    readonly configFile?: string;
    readonly files?: Readonly<Record<string, string>>;
    /** Package paths no one may read or list while the project loads. */
    readonly unreadable?: readonly string[];
    readonly producers?: readonly DefinitionProducer[];
  } = {},
): Promise<LoadedFixture> {
  const materialized = materializeFixturePackage(fixture);
  const locked = (options.unreadable ?? []).map((path) =>
    join(materialized.root, path),
  );
  try {
    writeFiles(materialized.root, options.files ?? {});
    const loader = new DefinitionSourceLoader(directImporter);
    const packageRevision = packageRevisionOf(materialized.root);
    for (const path of locked) chmodSync(path, 0o000);
    const project = await loadProjectDefinitions({
      loader,
      configFile: join(
        materialized.root,
        options.configFile ?? "powerhouse.config.json",
      ),
      packageRevision,
      ...(options.producers !== undefined && { producers: options.producers }),
      // Node keeps no module graph; each fixture source declares its model itself.
      importedFiles: (specifier) => [join(materialized.root, specifier)],
    });
    const report = await checkProjectDefinitions(project);
    await loader.dispose();
    return { root: materialized.root, project, report };
  } finally {
    for (const path of locked) chmodSync(path, 0o755);
    materialized.dispose();
  }
}

/** A stored schema-first model, as the document model editor saves it. */
export function storedModel(
  id: string,
  name: string,
  overrides: {
    readonly globalSchema?: string;
    readonly initialValue?: string;
    readonly versions?: readonly number[];
    readonly modules?: readonly unknown[];
  } = {},
): string {
  const state = `${name}State`;
  const specification = (version: number) => ({
    version,
    changeLog: [],
    state: {
      global: {
        schema:
          overrides.globalSchema ?? `type ${state} {\n  title: String!\n}`,
        initialValue: overrides.initialValue ?? '{"title":""}',
        examples: [],
      },
      local: { schema: "", initialValue: "{}", examples: [] },
    },
    modules: overrides.modules ?? [
      {
        id: "main",
        name: "main",
        description: null,
        operations: [
          operation("SET_TITLE", "input SetTitleInput {\n  title: String!\n}"),
        ],
      },
    ],
  });
  return JSON.stringify({
    id,
    name,
    description: "",
    extension: `.${name.toLowerCase()}`,
    author: { name: "Fixture", website: null },
    specifications: (overrides.versions ?? [1]).map(specification),
  });
}

export function operation(
  name: string,
  schema: string | null,
  errors: readonly {
    readonly name: string;
    readonly code: string;
    readonly id?: string;
  }[] = [],
) {
  return {
    id: name.toLowerCase(),
    name,
    description: null,
    scope: "global",
    schema,
    reducer: null,
    template: null,
    errors: errors.map((error) => ({
      id: error.name.toLowerCase(),
      description: null,
      template: null,
      ...error,
    })),
    examples: [],
  };
}
