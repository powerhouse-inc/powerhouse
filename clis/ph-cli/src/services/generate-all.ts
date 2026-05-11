import { generateAll } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";

export async function startGenerateAll(projectDir: string) {
  const project = buildTsMorphProject(projectDir);
  await generateAll(project);
  await project.save();
}
