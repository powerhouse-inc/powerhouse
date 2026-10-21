import { md } from "@tmpl/core";

export const readmeTemplate = md`
# Powerhouse package

This package holds document models, editors, processors and subgraphs for the Powerhouse ecosystem. Hosts such as Connect and Switchboard load it as a Reactor package.

## Commands

| Command                 | What it does                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| \`npm run vetra\`         | Starts Vetra: Vetra Studio (a local Connect) and Vetra Switchboard. Add \`-- --watch\` to load your changes as you save them. |
| \`npm run generate\`      | Runs \`ph generate\`, which creates or regenerates models, editors and other modules.                                         |
| \`npm run check\`         | Runs \`ph model check\`, which checks the code-first model declarations.                                                      |
| \`npm run tsc\`           | Checks the types.                                                                                                           |
| \`npm run lint:fix\`      | Runs oxlint with type-aware rules and fixes what it can.                                                                    |
| \`npm run format\`        | Formats the code with oxfmt.                                                                                                |
| \`npm test\`              | Runs the tests with Vitest.                                                                                                 |
| \`npm run test:coverage\` | Runs the tests and fails when reducer coverage drops below 95%.                                                             |
| \`npm run build\`         | Builds the package.                                                                                                         |

## Document models

You can write each document model in one of two ways, and one package can hold both kinds.

|                 | Schema-first                                         | Code-first                                                                               |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| You edit        | the model document, in the Vetra Studio model editor | TypeScript files                                                                         |
| Recognize it by | \`document-models/<name>/<name>.json\` and \`v<n>/gen/\` | an entry in \`definitionSources.entries\` in \`powerhouse.config.json\`, and \`v<n>/modules/\` |
| Reducers        | \`v<n>/src/reducers/<module>.ts\`                      | \`reduce\` in each operation in \`v<n>/modules/<module>.ts\`                                 |
| Errors          | defined on each operation in the model editor        | \`errors\` in each operation in \`v<n>/modules/<module>.ts\`                                 |
| Tests           | \`v<n>/tests/\`                                        | \`v<n>/tests/\`                                                                            |
| Generated files | \`v<n>/gen/\`, which codegen rewrites                  | none                                                                                     |

A model is code-first only when an entry in \`definitionSources.entries\` points at it. \`mode\` does not classify models: the first code-first model changes it from \`"schema-first"\` to \`"code-first"\`, and the schema-first models stay schema-first.

### Create a schema-first model

1. Run \`npm run vetra -- --watch\` and open Vetra Studio.
2. Create a document model in the Vetra drive. Define its state schema, modules, operations and errors in the model editor. Vetra writes \`document-models/<name>/\`.
3. Implement the reducers in \`v<n>/src/reducers/<module>.ts\`. Codegen does not overwrite these files. Do not edit \`gen/\`, because codegen rewrites it.
4. Add tests in \`v<n>/tests/\` and run \`npm test\`.

### Create a code-first model

1. Run \`ph generate document-model --code-first <name>\`. The command writes the model, registers it in \`powerhouse.config.json\` and \`powerhouse.manifest.json\`, and adds it to \`document-models/index.ts\`.
2. Declare the state in \`v<n>/definition.ts\`. Declare the operations, their reducers and their errors in \`v<n>/modules/<module>.ts\`.
3. After each edit, run \`npm run check\`, \`npm run tsc\` and \`npm test\`.

Connect shows the definition of a code-first model as read-only. Documents of the model stay editable. See [Choose an approach](https://academy.vetra.io/academy/Reference/DocumentModels/CodeFirst/ChooseYourApproach) and the [code-first quickstart](https://academy.vetra.io/academy/Reference/DocumentModels/CodeFirst/Quickstart).

## Editors

Run \`ph generate editor --name <name> --document-type <type>\`, or create an editor document for your document type in Vetra Studio. Codegen writes \`editors/<name>/\` and registers the editor in \`editors/editors.ts\`. Implement the UI in \`editors/<name>/editor.tsx\`, and test it in Vetra Studio.

## Subgraphs

Run \`ph generate subgraph --name <name>\`. The command creates \`subgraphs/<name>/index.ts\` and \`schema.ts\`, writes a checked barrel export, and refreshes the manifest. Regeneration preserves files inside existing subgraph directories. Export a \`BaseSubgraph<Ctx>\` class through the package's \`subgraphs\` entry. Declare \`static override readonly subgraphName = "kebab-case"\` and \`static override getSchema(schema: SchemaBuilder<YourClass>)\`. Return typed \`ph\` entries or one \`schema.graphql({ typeDefs, resolverCoordinates, resolvers: (subgraph) => ... })\` wrapper. Resolvers read instance state through \`subgraph\`.

Shared behavior belongs in one abstract base and schema fragments with public capabilities. Extend a typed parent's schema with \`super.getSchema(schema)\`, or call \`schema.replaceParentSchema()\` for an intentional replacement. Do not use mixin factories. Lifecycle overrides call \`super\`, and teardown tolerates partial setup. \`onDisconnect\` is not a process-exit hook.

Run \`ph migrate\` before rebuilding old-style subgraphs. Running hosts keep serving published old-style packages through the legacy adapter with a development-only notice. Every existing endpoint, schema, and WebSocket and SSE mount stays unchanged. New class-based packages require a matching host API release.

See [Subgraph classes](https://academy.vetra.io/academy/Reference/GraphQLData/SubgraphClasses) and the [testing recipe](https://academy.vetra.io/academy/Reference/GraphQLData/TestingSubgraphs). \`AGENTS.md\` includes fixes for common authoring errors.

## Coding agents

\`AGENTS.md\` holds the instructions for coding agents, and \`CLAUDE.md\` imports it. Optional editor recipes that it links are in \`docs/agent-guides/\`. \`.mcp.json\` connects agents to \`reactor-mcp\` on Vetra Switchboard.
`.raw;
