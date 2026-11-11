import { camelCase, kebabCase, pascalCase } from "change-case";
import path from "node:path";
import type { Project } from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
} from "utils";
import {
  codeFirstSubgraphSchemaTemplate,
  codeFirstSubgraphTemplate,
} from "../templates/code-first/subgraph.js";
import { registerSubgraph } from "./subgraph-registration.js";

/** Writes `subgraphs/<kebab>/{index.ts, schema.ts}` once, then registers the
 * subgraph. Its `subgraphName` is the kebab-case name. */
export async function generateCodeFirstSubgraph(
  subgraphName: string,
  project: Project,
) {
  const names = {
    kebabName: kebabCase(subgraphName),
    pascalName: pascalCase(subgraphName),
    camelName: camelCase(subgraphName),
  };
  const subgraphsDir = getOrCreateDirectory(project, "subgraphs").directory;
  const subgraphDir = path.join(subgraphsDir.getPath(), names.kebabName);
  await ensureDirectoriesExist(project, subgraphsDir.getPath(), subgraphDir);
  for (const [file, template] of [
    ["index.ts", codeFirstSubgraphTemplate],
    ["schema.ts", codeFirstSubgraphSchemaTemplate],
  ] as const) {
    const { alreadyExists, sourceFile } = getOrCreateSourceFile(
      project,
      path.join(subgraphDir, file),
    );
    if (alreadyExists) continue;
    sourceFile.replaceWithText(template(names));
    await formatSourceFileWithPrettier(sourceFile);
  }
  await registerSubgraph({
    project,
    subgraphsDir: subgraphsDir.getPath(),
    subgraph: { name: names.kebabName, id: names.kebabName },
  });
}
