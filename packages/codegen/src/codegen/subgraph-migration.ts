import { ModuleKind, ModuleResolutionKind, Project, QuoteKind } from "ts-morph";
import { formatSafe } from "../utils/format-with-prettier.js";
import { analyze, readProjectScalars } from "./subgraph-migration/analysis.js";
import {
  type Input,
  KEPT_SDL,
  refuse,
  Refused,
  sourceFile,
  type SubgraphMigrationFile,
  type SubgraphMigrationRefusal,
  withLineEndings,
} from "./subgraph-migration/context.js";
import { indexFileText } from "./subgraph-migration/index-file.js";
import { inlineResolvers } from "./subgraph-migration/inline-resolvers.js";
import { readResolverMap } from "./subgraph-migration/resolver-map.js";
import { schemaFileText } from "./subgraph-migration/schema-emission.js";
import {
  mergeExtensions,
  parseSdl,
  schemaSource,
  sdlSpecifiers,
  sortedSchemaText,
  withHostScalars,
} from "./subgraph-migration/sdl.js";
import { checkStaticParity } from "./subgraph-migration/static-parity.js";
import {
  classMembers,
  subgraphClass,
} from "./subgraph-migration/subgraph-class.js";

export {
  castResolverTypeErrors,
  type ProjectTypeCheck,
  type ProjectTypeError,
  projectTypeErrors,
  resolverCallErrors,
  type ResolverTypeError,
  typeErrorMessage,
} from "./subgraph-migration/type-check.js";
export { sortedSchemaText } from "./subgraph-migration/sdl.js";
export type {
  SubgraphMigrationFile,
  SubgraphMigrationRefusal,
} from "./subgraph-migration/context.js";

/**
 * @experimental The outcome of converting one schema-first subgraph
 * directory. `no-subgraph-class` is a directory whose `index.ts` declares
 * and exports no class, such as a directory of helpers.
 */
export type SubgraphMigration =
  | {
      readonly kind: "refused" | "no-subgraph-class";
      readonly dirName: string;
      readonly refusals: readonly SubgraphMigrationRefusal[];
    }
  | {
      readonly kind: "converted";
      readonly dirName: string;
      readonly subgraphName: string;
      readonly className: string;
      readonly files: readonly SubgraphMigrationFile[];
      /** What the developer should know about the conversion. */
      readonly notes: readonly string[];
      /** The schema-first SDL as {@link sortedSchemaText} prints it. */
      readonly sdl: string;
      /** Project-relative path of the file the SDL was read from. */
      readonly sdlFile: string;
    };

/**
 * @experimental Converts the schema-first subgraph in `subgraphs/<dirName>/`
 * into a code-first one, or explains why it cannot keep the same schema and
 * behaviour. `files` holds the project's files by project-relative path: at
 * least those of the directory, and `scalars/index.ts` when it exists.
 * Nothing is read from or written to disk.
 */
export async function migrateSubgraph(options: {
  readonly dirName: string;
  readonly files: ReadonlyMap<string, string>;
  /**
   * Project-relative targets read from outside the directory or through
   * project aliases. Their exports must remain available to those readers.
   */
  readonly importedFromOutside?: ReadonlySet<string>;
  /**
   * Those of `importedFromOutside` some outside file reads whole (namespace
   * import, `export *`, dynamic import). Absent, every outside reader counts.
   */
  readonly readWholeFromOutside?: ReadonlySet<string>;
}): Promise<SubgraphMigration> {
  const input: Input = {
    dir: `subgraphs/${options.dirName}`,
    files: options.files,
    ...(options.importedFromOutside && {
      importedFromOutside: options.importedFromOutside,
    }),
    ...(options.readWholeFromOutside && {
      readWholeFromOutside: options.readWholeFromOutside,
    }),
  };
  try {
    return await convert(input, options.dirName);
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    return {
      kind: error.noSubgraphClass ? "no-subgraph-class" : "refused",
      dirName: options.dirName,
      refusals: [error.refusal],
    };
  }
}

async function convert(
  input: Input,
  dirName: string,
): Promise<SubgraphMigration> {
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { quoteKind: QuoteKind.Double },
    compilerOptions: {
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.Bundler,
      strict: true,
    },
  });
  // The directory's modules, so the checker sees what the resolvers import.
  for (const path of input.files.keys()) {
    if (path.startsWith(`${input.dir}/`) && /\.tsx?$/.test(path)) {
      sourceFile(project, input, path);
    }
  }
  const indexPath = `${input.dir}/index.ts`;
  const index = sourceFile(project, input, indexPath);
  const cls = subgraphClass(project, input, index);
  const className = cls.getNameOrThrow();
  const members = classMembers(cls, indexPath);
  const sdlSource = schemaSource(project, input, index, members.typeDefs);
  const parsed = mergeExtensions(parseSdl(sdlSource));
  const resolversMember = members.resolvers;
  if (resolversMember === undefined) {
    throw new Error("classMembers requires the resolvers field.");
  }
  const resolverMap = readResolverMap(
    project,
    input,
    index,
    resolversMember.getInitializerOrThrow(),
  );
  const scalars = readProjectScalars(project, input);
  const document = withHostScalars(parsed, scalars);
  const model = analyze(document, sdlSource, resolverMap, scalars);

  const hasSubscriptionType = model.roots.Subscription !== undefined;
  if (members.hasSubscriptions !== hasSubscriptionType) {
    refuse(
      indexPath,
      members.hasSubscriptionsLine,
      hasSubscriptionType
        ? "The SDL declares a Subscription type, but hasSubscriptions is not true, so the host does not serve its subscriptions. A code-first subgraph with a subscription always serves them."
        : "hasSubscriptions is true, but the SDL declares no Subscription type.",
      hasSubscriptionType
        ? "Set hasSubscriptions = true, or remove the Subscription type."
        : "Remove hasSubscriptions, or add the Subscription type.",
    );
  }

  const sdl = sortedSchemaText(document);
  checkStaticParity(model, members.name, sdl, sdlSource);

  const schemaPath = `${input.dir}/schema.ts`;
  const indexBefore = input.files.get(indexPath) ?? null;
  const schemaBefore = input.files.get(schemaPath) ?? null;
  // Files that import the SDL import it from schema-sdl.ts, before the
  // resolvers move, so a moved import names it too.
  const sdlImporters = sdlSource.sdlImporters ?? [];
  for (const path of sdlImporters) {
    for (const declaration of sdlSpecifiers(project, input, path, schemaPath)) {
      declaration.setModuleSpecifier(
        declaration
          .getModuleSpecifierValue()!
          .replace(/schema(\.[cm]?[jt]s)?$/, `${KEPT_SDL}$1`),
      );
    }
  }
  const inlined = inlineResolvers(project, input, index, cls, resolversMember);
  const inlinedClass = index.getClassOrThrow(className);
  const files: SubgraphMigrationFile[] = [
    {
      path: indexPath,
      before: indexBefore,
      after: withLineEndings(
        await formatSafe(
          await indexFileText(
            index,
            inlinedClass,
            classMembers(inlinedClass, indexPath, true),
            model,
            inlined,
          ),
        ),
        indexBefore,
      ),
    },
    ...(inlined.factoryFile === undefined
      ? []
      : [
          {
            path: inlined.factoryFile.path,
            before:
              input.files.get(inlined.factoryFile.path) ??
              inlined.factoryFile.before,
            after:
              inlined.factoryFile.after === null
                ? null
                : withLineEndings(
                    await formatSafe(inlined.factoryFile.after),
                    inlined.factoryFile.before,
                  ),
          },
        ]),
    {
      path: schemaPath,
      before: schemaBefore,
      after: withLineEndings(
        await formatSafe(schemaFileText(model, members.name)),
        schemaBefore ?? indexBefore,
      ),
    },
    ...(sdlImporters.length === 0 || schemaBefore === null
      ? []
      : [
          {
            path: `${input.dir}/${KEPT_SDL}.ts`,
            before: null,
            after: schemaBefore,
          },
          ...sdlImporters
            .filter((path) => path !== inlined.factoryFile?.path)
            .map((path) => ({
              path,
              before: input.files.get(path) ?? null,
              after: sourceFile(project, input, path).getFullText(),
            })),
        ]),
  ];
  const notes = [
    ...inlined.notes,
    ...(sdlImporters.length === 0
      ? []
      : [
          `${input.dir}/${KEPT_SDL}.ts keeps the schema-first SDL for ${sdlImporters.join(", ")}, which now import${sdlImporters.length === 1 ? "s" : ""} it from there. It does not follow the descriptors in schema.ts; retire it once ${sdlImporters.length === 1 ? "that file reads" : "those files read"} the subgraph instead.`,
        ]),
  ];
  return {
    kind: "converted",
    dirName,
    subgraphName: members.name,
    className,
    files: files.filter((file) => file.before !== file.after),
    notes,
    sdl,
    sdlFile: sdlSource.file,
  };
}
