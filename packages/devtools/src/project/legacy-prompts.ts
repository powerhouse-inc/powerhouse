/** What DevTools gives a user to paste into a coding agent. Each prompt was
 * checked sentence by sentence against `ph migrate` and tried by agents in
 * legacy projects: change the wording only with the command's behaviour in
 * hand. */

export function documentModelPrompt({
  folder,
  type,
  command,
}: {
  folder: string;
  type: string;
  command: string;
}): string {
  return [
    `Use the \`ph\` CLI to convert the legacy document model in \`${folder}/\` (document type \`${type}\`) to the current form, a model declared with \`defineDocumentModel\`. Powerhouse 6.4 is planned to stop loading packages that still have a legacy document model. Stored documents and the code that imports this model depend on it, so its state, operations, inputs and errors must stay the same.`,
    "",
    `Context:`,
    `- \`ph\` calls the legacy form "schema-first" and the current one "code-first". \`ph migrate --help\` describes the files the conversion writes.`,
    `- Where this project's AGENTS.md or skills describe the legacy layout (\`gen/\`, \`src/reducers/\`, changing the model through reactor-mcp), follow this prompt instead.`,
    `- Run commands from the project root. Without \`ph\` on the PATH, use \`pnpm exec ph-cli\` or \`npx ph-cli\`.`,
    "",
    `Steps (do them without asking me first; stop only where this prompt says to):`,
    `1. If git shows uncommitted changes, stop and tell me, so that the conversion can be reviewed and undone on its own.`,
    `2. Run the type check, the tests and the linter (\`npm run tsc\`, \`npm test\` and \`npm run lint\` in a generated project) and note what already fails. Those failures are not yours to fix.`,
    `3. Run \`${command}\`.`,
    `   - Success is exit 0 with \`converted ... every version keeps its definition\`: the converted model loaded with the same types, state, operations, inputs and errors. Read each \`Note:\` line. Changed stored names of modules and operations are expected, since action types stay the same. An input field that can now be undefined needs a reducer change that keeps behaviour.`,
    `   - \`not converted\` with a repair line under the reason: apply the repair and run the command again only if it is an edit to this model's code, or to a file in this project that imports it, that nothing else can observe. Otherwise stop and tell me, for example for a rename, \`--rename-conflicting-types\`, \`ph generate\`, the document model editor, or keeping the model schema-first. Stop too if the same refusal returns.`,
    `   - Anything else, such as a non-zero exit after \`converted\`, restored files, \`ph migrate <version>\` (it upgrades every Powerhouse package in the project) or a request to install dependencies: stop and tell me what it printed.`,
    `4. Run \`ph model check\` and the checks from step 2 again. The names the generated code exported now come from \`${folder}/compat/v<N>/\`, and the command rewrote this project's imports. Fix what the conversion broke, including lint and formatting, in the files it changed only. Change a test only where an import or a name moved; if one fails for another reason, tell me rather than changing what it asserts.`,
    "",
    `Limits:`,
    `- Besides what the command writes, change only this model and the files that import it. Tell me about anything else instead of doing it.`,
    `- A temporary test that runs the same actions through the old reducer, taken from git, and the converted one is welcome. Remove it and tell me what it showed.`,
    `- Leave the changes uncommitted for me to review: no commit, stash or reset.`,
    "",
    `Finish when the model is converted and step 4 shows no failure that step 2 did not, or when what remains needs me. Then tell me in a short list: the commands you ran and their results, what each note required, the files you edited by hand, what failed before you started, the decisions you need from me, and what is not proven. Nothing replays stored documents against the converted model, and its \`index.ts\` no longer exports the generated names, so code outside this project that imports them will break.`,
  ].join("\n");
}

export function subgraphPrompt({
  folder,
  command,
}: {
  folder: string;
  command: string;
}): string {
  return [
    `Use the \`ph\` CLI to convert the legacy subgraph in \`${folder}/\` to the current form, a class that extends \`Subgraph\` from \`@powerhousedao/reactor-api\` and declares its schema in \`static getSchema\`. Powerhouse 6.4 is planned to stop loading packages that still have a legacy subgraph. Whatever queries this subgraph depends on its name, its GraphQL schema and what each resolver returns, so they must stay the same.`,
    "",
    `Context:`,
    `- \`ph\` calls the legacy form "schema-first" and the current one "code-first". \`ph migrate --help\` describes the files the conversion writes.`,
    `- Where this project's AGENTS.md or skills say to keep the class extending \`BaseSubgraph\`, or never to write a subgraph by hand, follow this prompt instead.`,
    `- Run commands from the project root. Without \`ph\` on the PATH, use \`pnpm exec ph-cli\` or \`npx ph-cli\`.`,
    "",
    `Steps (do them without asking me first; stop only where this prompt says to):`,
    `1. If git shows uncommitted changes, stop and tell me, so that the conversion can be reviewed and undone on its own.`,
    `2. Run the type check, the tests and the linter (\`npm run tsc\`, \`npm test\` and \`npm run lint\` in a generated project) and note what already fails. Those failures are not yours to fix.`,
    `3. Run \`${command}\`.`,
    `   - Success is exit 0 with \`converted ... it serves the same schema\`, compared sorted, so the order of fields may change. The resolvers are now members of the class in \`index.ts\`. If they came from another file, usually \`resolvers.ts\`, the old map stays there and \`index.ts\` still imports it: leave that file and edit the class. Read each \`Note:\` line.`,
    `   - Resolver calls whose types disagree with the schema are cast under a \`// ph migrate:\` comment and listed. Remove a cast and its comment only when correcting the declared types makes the call compile. An added \`!\` or \`as\` is still a cast, and one fix can reveal another error at the same call. If it needs a change in what runs or in the schema, leave the cast.`,
    `   - \`index.ts exports no subgraph class\`: the command converts only classes, a host loads only classes from \`subgraphs/\`, and the repair line it prints does not apply. If the directory holds only helpers, or if anything in the project passes the object to \`registerSubgraphInstance\`, stop and tell me: neither has a conversion yet. Otherwise write the class by hand in place of the object. Start from the example in the JSDoc of \`Subgraph\` in \`node_modules/@powerhousedao/reactor-api/dist/index.d.mts\`: the same name in \`static subgraphName\`; types built with \`ph\` from \`document-model\` (\`ph.object\`, \`ph.input\`, \`ph.enum\`, \`ph.ref\`, \`ph.list\`, \`{ required: true }\` for \`!\`), descriptions included; one \`schema.query\`, \`schema.mutation\` or \`schema.field\` per field, whose \`resolve\` receives \`{ parent, args, request, info, subgraph }\` (\`request\` was \`context\`) and calls the existing resolver function. If part of the old schema has no counterpart, stop and tell me. Then show, with a temporary test, that the class's schema equals the old \`typeDefs\` when both are printed sorted, and tell me that a host will serve this subgraph once \`subgraphs/index.ts\` exports its directory.`,
    `   - Any other \`not converted\` with a repair line under the reason: apply the repair and run the command again only if it is an edit to this subgraph's code that no client can observe. Otherwise stop and tell me, for example for a renamed type or field, a changed route, a repair that says to convert it by hand, or keeping the subgraph schema-first. Stop too if the same refusal returns.`,
    `   - Anything else, such as a non-zero exit after \`converted\`, restored files, \`ph migrate <version>\` (it upgrades every Powerhouse package in the project) or a request to install dependencies: stop and tell me what it printed.`,
    `4. Run \`ph model check\`, which should now list the subgraph by name, and the checks from step 2 again. Fix what the conversion broke, including lint and formatting, in the files it changed only. Change a test only where an import or a name moved; if one fails for another reason, tell me rather than changing what it asserts. If the tests still call the old resolver map, they prove nothing about the class: tell me rather than rewriting them.`,
    "",
    `Limits:`,
    `- Besides what the command writes, change only this subgraph and the files that import it. Tell me about anything else instead of doing it.`,
    `- A temporary test that runs the same queries through the old resolver map, taken from git if the conversion removed it, and the class is welcome: \`new <Class>({} as never)\` gives an instance with \`typeDefs\` and \`resolvers\`. Remove it and tell me what it showed.`,
    `- Leave the changes uncommitted for me to review: no commit, stash or reset.`,
    "",
    `Finish when the subgraph is converted and step 4 shows no failure that step 2 did not, or when what remains needs me. Then tell me in a short list: the commands you ran and their results, what each note said, the casts you removed and the ones you left, the files you edited by hand, what failed before you started, the decisions you need from me, and what is not proven. The command never calls a resolver, so only tests show that the results are the same.`,
  ].join("\n");
}
