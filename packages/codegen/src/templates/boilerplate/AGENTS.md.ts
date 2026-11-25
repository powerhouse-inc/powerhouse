import { md } from "@tmpl/core";

/** The managed block of a project's AGENTS.md: rules every task needs. Task
 * procedures live in the skills under packages/codegen/skills/. */
export const agentsTemplate = md`
# Powerhouse project

This repository is a Powerhouse reactor package: document models, editors, drive apps, processors and subgraphs. You write its code in this repository, and you run it against the project's local dev stack through the \`reactor-mcp\` MCP server.

## Concepts

- **Document model**: a document type, defined by a state schema and the operations that change it. Code in \`document-models/<name>/\`.
- **Document**: an instance of a model. It changes only through actions; a dispatched action becomes an operation.
- **Drive**: a \`powerhouse/document-drive\` document that holds documents and folders.
- **Dev stack**: what \`ph dev\` runs, the project's \`hosts/dev\` host: a Switchboard that serves GraphQL and \`reactor-mcp\`, and a Connect that shows drives, documents and editors. Both load this project's code and reload it when it changes.
- **Stub**: the starting code \`ph generate <kind> --name <name>\` writes for a document model, editor, drive app, processor or subgraph. You write the rest.

## Start the dev stack

Use \`reactor-mcp\` to create and change documents. Its tools are there from the start of the session: the first tool call connects to the project's dev stack, or starts \`ph run dev --strictPort\` in the background and waits for it, so that call can take a while and reports its progress. Don't start the stack yourself. **Never start a second reactor**: two reactors share \`.ph/\` storage and their drives diverge.

Once a call succeeds, give the user the \`connectUrl\` from \`.ph/vetra-runtime.json\`. The stack picks up code changes, new routes and \`powerhouse.config.json\` changes by itself; call the \`restartVetra\` tool only for a change it reads at startup, such as installed packages. If a tool call returns a startup error, report it to the user with the output it carries (the full log is \`.ph/vetra.log\`). To stop the stack, stop the process whose pid \`.ph/vetra-runtime.json\` names; other \`ph run dev\` and \`ph dev\` processes on the machine belong to other projects.

## reactor-mcp

- Call \`getDocumentModelSchema\` with \`compact: true\` for a document type before calling \`addActions\` on it.
- \`createDocument\` assigns ids; never set them. Pass \`driveId\` to add the document to a drive in the same call.
- Batch actions into one \`addActions\` call.
- Every tool takes the document or drive it acts on as \`documentId\`.
- \`addActions\` returns a result per action; \`success\` is false when any action carries an \`error\` (a reducer rejected it, or a policy denied it). Fix and resend those.

## Rules

- **Write code, not specification documents.** A document model, editor, drive app, processor or subgraph starts as a stub from \`ph generate\` and changes by editing its files.
- **Never edit \`gen/\` folders or \`.ph/\`.** They are generated and overwritten.
- Reducers are pure and synchronous. Ids, dates and random values come from the action input.
- In an interactive session, propose a new document model's state and operations and wait for approval. Without a user, state the proposal and continue.

## Check your work

After a change, run:

- \`ph model check\` after a document model change
- \`npm run tsc\`
- \`npm run lint:fix\`
- \`npm run test:coverage\` after a reducer change. Reducers stay at 95% or more on lines, branches, functions and statements. Add tests in \`document-models/<name>/v<n>/tests/\`; don't lower the threshold.

## Tasks

Read the skill before you start one of these tasks. \`ph migrate\` keeps identical copies in \`.agents/skills/\` and \`.claude/skills/\`; don't edit either. Where a skill says \`ph <command>\`, \`pnpm exec ph-cli <command>\` works when \`ph\` isn't installed globally.

| Task                                                                          | Skill                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| Create or change a document model: state, operations, reducers, errors, tests | \`.agents/skills/powerhouse-document-models/SKILL.md\`      |
| Create or change a document editor or a drive app                             | \`.agents/skills/powerhouse-editors/SKILL.md\`              |
| Create or change a processor or a GraphQL subgraph                            | \`.agents/skills/powerhouse-processors-subgraphs/SKILL.md\` |
| Change Connect: pages, sidebar, layout, modals, theme, branding, app config   | \`.agents/skills/customize-connect/SKILL.md\`               |

## Project layout

- \`document-models/<name>/\`: \`v<n>/definition.ts\` (state), \`v<n>/modules/\` (operations and reducers), \`v<n>/tests/\`, \`upgrades/\`
- \`editors/<id>/\`: editors and drive apps, registered in \`editors/editors.ts\`
- \`processors/\`, \`subgraphs/\`: processors and GraphQL subgraphs
- \`hosts/\`: the applications the project runs (\`ph run <host>\`); \`hosts/connect/routes/\` holds Connect routes
- \`powerhouse.config.json\`: project config, including Connect's (\`connect\`)
`.raw;
