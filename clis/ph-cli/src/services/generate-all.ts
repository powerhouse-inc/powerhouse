import { generateAll } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { extractAllDocuments, saveSpec } from "@powerhousedao/vetra/codegen";

export async function startGenerateAll(
  args: { extract?: boolean },
  projectDir: string,
) {
  const project = buildTsMorphProject(projectDir);
  if (args.extract) {
    const all = extractAllDocuments(project);
    for (const doc of [
      ...all.documentModels,
      ...all.editors,
      ...all.processors,
      ...all.subgraphs,
      ...all.apps,
    ]) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
    return;
  }
  await generateAll(project);
  await project.save();
}
