import type { CodeFirstModelGeneration } from "@powerhousedao/codegen";
import { capitalCase, kebabCase } from "change-case";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readPackage } from "read-pkg";
import type { Project } from "ts-morph";

export async function scaffoldCodeFirstDocumentModel(
  generation: CodeFirstModelGeneration,
  name: string,
  projectDir: string,
  project: Project,
) {
  const modelName = name.trim();
  if (modelName === "") {
    throw new Error("--name needs a document model name.");
  }
  const namespace = await documentTypeNamespace(projectDir);
  const documentType = `${namespace}/${kebabCase(modelName)}`;
  const editorName = `${capitalCase(modelName)} Editor`;
  const editorDirName = kebabCase(editorName);
  if (existsSync(join(projectDir, "editors", editorDirName))) {
    throw new Error(
      `editors/${editorDirName} already exists. Choose another --name, or move that editor first.`,
    );
  }

  const result = await generation.scaffoldDocumentModel(
    {
      name: modelName,
      documentType,
      author: { name: namespace, website: null },
    },
    project,
  );
  for (const path of result.written) {
    console.log(`Wrote ${path}`);
  }
  console.log(
    result.registration === "unchanged"
      ? "powerhouse.config.json definitionSources already lists this model"
      : `Registered ${documentType} in powerhouse.config.json definitionSources (${result.registration})`,
  );

  await generation.generateEditor(
    {
      editorName,
      documentTypes: [documentType],
      editorId: editorDirName,
      editorDirName,
    },
    project,
  );
  await project.save();
  console.log(`Generated editor "${editorName}" in editors/${editorDirName}`);
}

async function documentTypeNamespace(projectDir: string) {
  const { name } = await readPackage({ cwd: projectDir, normalize: false });
  if (!name) {
    throw new Error(
      "--name puts the document type under the package name. Add a name to package.json.",
    );
  }
  return name.replace(/^@/, "").replaceAll("/", "-");
}
