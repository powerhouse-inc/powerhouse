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
import { basename } from "node:path";
import { readPackage } from "read-pkg";
import type { Project } from "ts-morph";
import type { GeneratePieceArgs } from "../types.js";

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
      message: "What id should this piece have? A block type names it.",
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
    pieceVersion,
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
  if (all) {
    await generateAllPieces(project);
  } else if (dir) {
    await generateAllPieces(project, basename(dir.replace(/\/+$/, "")));
  } else if (name) {
    const pieceId = await resolvePieceId({
      project,
      projectDir,
      pieceName: name,
      id,
    });
    await generatePiece(
      { pieceName: name, pieceId, pieceVersion, auth, description },
      project,
    );
  } else {
    console.log("Please specify one of `name`, `dir`, or `all`.");
    return;
  }
  await project.save();
  await syncFeatureDependencies(detectFeatures(projectDir), projectDir);
}
