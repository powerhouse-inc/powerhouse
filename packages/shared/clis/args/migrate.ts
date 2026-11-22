import {
  array,
  boolean,
  flag,
  multioption,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
import { debugArgs } from "./common.js";

const versionDescription =
  "The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `next`, `latest`. Defaults to the release channel of the project's installed Powerhouse packages.";

export const migrateArgs = {
  versionPositional: positional({
    type: optional(string),
    displayName: "version",
    description: versionDescription,
  }),
  version: option({
    long: "version",
    short: "v",
    type: optional(string),
    description: versionDescription,
  }),
  force: flag({
    type: optional(boolean),
    long: "force",
    short: "f",
    description:
      "Run migrate from the bundled codegen even if the target version cannot be resolved from the npm registry or differs from the installed ph-cli version.",
  }),
  subgraphs: flag({
    type: optional(boolean),
    long: "subgraphs",
    description:
      "Convert every schema-first subgraph under subgraphs/ into a code-first one, keeping its schema and resolvers. Each resolver becomes a member of the subgraph class that getSchema calls directly, and each separate resolver factory module stays loaded in its original order to preserve initialization and shared bindings. Other files that import the schema-first SDL get it from schema-sdl.ts. Code-first subgraphs are skipped, and a subgraph that cannot keep the same schema is left as it is, with the reason. The project's tsc then checks the converted resolvers against the schema they serve: each call it rejects, because the resolver's own types disagree with the schema, is cast with a ph migrate comment so it runs as before and the project compiles, and is listed to fix. Upgrades no dependencies and regenerates nothing else.",
  }),
  strictResolvers: flag({
    type: optional(boolean),
    long: "strict-resolvers",
    description:
      "With --subgraphs or --subgraph: leave the resolver calls tsc rejects without a cast, so the project does not compile until each resolver's types agree with the schema. They are listed either way.",
  }),
  subgraph: multioption({
    type: array(string),
    long: "subgraph",
    description:
      "Convert only this directory of subgraphs/ into a code-first subgraph. Repeat it for more directories. Implies --subgraphs.",
    defaultValue: () => [],
  }),
  documentModels: flag({
    type: optional(boolean),
    long: "document-models",
    description:
      "Convert every schema-first document model into a code-first one, keeping each version's definition and reducers. The model gets the layout ph generate document-model --code-first writes: index.ts, upgrades/index.ts, and per version definition.ts, index.ts and modules/; the custom code of src/ moves into the version's directory. The generated code, src/ and <name>.json are removed. The names the generated code exported stay available from compat/v<N>/index.ts, imports of removed files are rewritten to it, and the document-models barrels are regenerated. A model that cannot keep the same definition is left as it is, with the reason. Upgrades no dependencies.",
  }),
  documentModel: multioption({
    type: array(string),
    long: "document-model",
    description:
      "Convert only this directory of the document models directory into a code-first model. Repeat it for more directories. Implies --document-models.",
    defaultValue: () => [],
  }),
  renameConflictingTypes: flag({
    type: optional(boolean),
    long: "rename-conflicting-types",
    description:
      "With --document-models or --document-model: rename a model type that has the name of a scalar, such as Address, by prefixing the model's name (InvoiceAddress), instead of refusing the model. The GraphQL type name changes; the TypeScript name the model's compat exports keeps the old name.",
  }),
  dryRun: flag({
    type: optional(boolean),
    long: "dry-run",
    description:
      "Print the diff of every file the migration would add, change or delete, and write nothing. It installs nothing and regenerates no code; it lists those steps instead.",
  }),
  ...debugArgs,
};
