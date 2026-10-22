import {
  detectFeatures,
  generateAllPieces,
  generatePiece,
  syncFeatureDependencies,
} from "@powerhousedao/codegen";
import { derivePieceId } from "@powerhousedao/codegen/name-builders";
import {
  buildTsMorphProject,
  readPiecesList,
} from "@powerhousedao/codegen/utils";
import { kebabCase } from "change-case";
import enquirer from "enquirer";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readPackage } from "read-pkg";
import type { Project } from "ts-morph";
import type { GeneratePieceArgs } from "../types.js";
import { installAddedDependencies } from "../utils/install-added-dependencies.js";
import { resolveModuleDirName } from "../utils/module-dir.js";

// The id a block type will name, asked for only where deriving one would claim
// a namespace nobody owns; CI, with no TTY, takes the derived value.
async function resolvePieceId(v: {
  project: Project;
  projectDir: string;
  pieceName: string;
  id?: string;
}): Promise<string> {
  if (v.id) return v.id;
  const pkg = await readPackage({ cwd: v.projectDir, normalize: false });
  const { id, needsConfirmation } = derivePieceId({
    packageName: pkg.name ?? "",
    slug: kebabCase(v.pieceName),
    hasOtherPieces: readPiecesList(v.project).length > 0,
  });
  if (!needsConfirmation || !process.stdin.isTTY) return id;
  const { prompt } = enquirer;
  const result = await prompt<{ pieceId: string }>([
    {
      type: "input",
      name: "pieceId",
      message:
        "What id should this piece have? A workflow step names it as its pieceName.",
      initial: id,
      required: true,
    },
  ]);
  return result.pieceId || id;
}

export async function startGeneratePiece(
  args: GeneratePieceArgs,
  projectDir: string,
) {
  const {
    namePositional,
    name: nameOption,
    id,
    auth,
    description,
    dir,
    all,
    debug,
  } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  const name = namePositional ?? nameOption;
  const report: string[] = [];
  if (all) {
    await generateAllPieces(project);
  } else if (dir) {
    const dirName = resolveModuleDirName(projectDir, "pieces", dir, "my-piece");
    if (!existsSync(join(projectDir, "pieces", dirName, "index.ts"))) {
      throw new Error(`pieces/${dirName} has no index.ts.`);
    }
    await generateAllPieces(project, dirName);
    report.push(`Re-registered the piece in pieces/${dirName}`);
  } else if (name) {
    const pieceId = await resolvePieceId({
      project,
      projectDir,
      pieceName: name,
      id,
    });
    await generatePiece(
      { pieceName: name, pieceId, auth, description },
      project,
    );
  } else {
    console.log("Please specify one of `name`, `dir`, or `all`.");
    return;
  }
  await project.save();
  for (const line of report) {
    console.log(line);
  }
  const added = await syncFeatureDependencies(
    detectFeatures(projectDir),
    projectDir,
  );
  await installAddedDependencies(added, projectDir, args.skipInstall);
}
