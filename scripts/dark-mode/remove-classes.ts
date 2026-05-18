import { forEach, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameList } from "./types.js";
import { removeClassesFromStringLiteral } from "./utils.js";

const classesToRemove: ClassNameList = [];
const project = makeTsMorphProject();
const files = await findFilesWithClasses(classesToRemove);

pipe(
  files,
  getStringLiteralsFromFiles(project),
  forEach(removeClassesFromStringLiteral(classesToRemove)),
);

await project.save();
