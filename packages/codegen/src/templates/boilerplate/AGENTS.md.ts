import { md } from "@tmpl/core";

/** The managed block of a project's AGENTS.md: rules every task needs. Task
 * procedures live in the skills under packages/codegen/skills/. */
export const agentsTemplate = md`
# Powerhouse project

This repository is a Powerhouse reactor package: document models, editors, drive apps, processors and subgraphs. You develop it against a local Vetra instance through the \`reactor-mcp\` MCP server.

## Concepts

- **Document model**: a document type, defined by a state schema and the operations that change it. Code in \`document-models/<name>/v<n>/\`.
- **Document**: an instance of a model. It changes only through actions; a dispatched action becomes an operation.
- **Drive**: a \`powerhouse/document-drive\` document that holds documents and folders.
- **Vetra**: the local development environment: Vetra Studio (a Connect) and a Switchboard that serves \`reactor-mcp\`. Document models, editors and apps are documents in the Vetra drive; codegen writes their code from them.
- **Connect** shows drives, documents and editors. **Switchboard** serves GraphQL and MCP.

## Start Vetra

Use \`reactor-mcp\` for all document and document-model work. If it is unreachable, start Vetra yourself:

1. If \`.ph/vetra-runtime.json\` describes a live instance, use it. **Never start a second reactor**: two reactors share \`.ph/\` storage and their drives diverge.
2. Run \`ph vetra --strictPort --watch\` in the background, with no port flags. The project's ports are in \`powerhouse.config.json\`.
3. Poll \`GET http://localhost:<port>/ready\` for up to 60 seconds, with the port from \`.mcp.json\`.
4. Give the user the \`connectUrl\` from \`.ph/vetra-runtime.json\` and reconnect to the MCP server. A session that started while Vetra was down may keep the tools off; then ask the user to reconnect them.

Ask the user only when startup fails, and include the error output. Vetra picks up new routes and \`powerhouse.config.json\` changes by itself; for a change it reads at startup, such as installed packages, run \`ph vetra --strictPort --watch --restart\` in the background. Don't edit \`.mcp.json\` to follow a port; \`ph vetra\` rewrites it when the port moves. To stop Vetra, stop the process whose pid \`.ph/vetra-runtime.json\` names; other \`ph vetra\` processes on the machine belong to other projects.

## reactor-mcp

- Call \`getDocumentModelSchema\` with \`compact: true\` for a document type before calling \`addActions\` on it.
- \`createDocument\` assigns ids; never set them. Pass \`driveId\` to add the document to a drive in the same call.
- Batch actions into one \`addActions\` call.
- After \`addActions\` on a Vetra source document (model, editor, app, processor, subgraph), call \`getCodegenStatus\` with its \`documentId\` and \`waitSeconds: 60\`, and fix what a \`failed\` or \`skipped\` status names before you edit the generated folders.
- Every tool takes the document or drive it acts on as \`documentId\`.
- \`addActions\` returns a result per action; \`success\` is false when any action carries an \`error\` (a reducer rejected it, or a policy denied it). Fix and resend those.
- The \`vetra-<hash>\` drive holds source documents: models, editors, apps. The \`preview-<hash>\` drive ("Vetra Preview") holds example documents.

## Rules

- **Never edit \`gen/\` folders or \`.ph/\`.** Codegen overwrites them.
- **Confirm editor and app documents.** Codegen writes nothing for an editor or drive app document that is still DRAFT.
- Change a document model in two places: through MCP (\`SET_STATE_SCHEMA\`, \`SET_OPERATION_SCHEMA\`, \`SET_OPERATION_REDUCER\`), or the next codegen restores the old reducer code; and in \`document-models/<name>/v<n>/src/reducers/\`, which codegen never overwrites, or the running code keeps the old behaviour.
- Reducers are pure and synchronous. Ids, dates and random values come from the action input.
- In an interactive session, propose a new document model's state and operations and wait for approval. Without a user, state the proposal and continue.

## Check your work

After a change, and once \`getCodegenStatus\` is \`settled\` (Vetra installs dependencies while it generates; lint and tsc report false errors mid-install, such as TS2305 on \`"document-model"\`), run:

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

- \`document-models/<name>/v<n>/\`: \`gen/\` (generated), \`src/\` (reducers), \`tests/\`
- \`editors/<id>/\`: editors and drive apps, registered in \`editors/editors.ts\`
- \`processors/\`, \`subgraphs/\`: processors and GraphQL subgraphs
- \`hosts/connect/routes/\`: Connect routes
- \`powerhouse.config.json\`: project config, including Connect's (\`connect\`)
`.raw;
