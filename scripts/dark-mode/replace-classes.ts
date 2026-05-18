import { entries, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = {} as const;
const project = makeTsMorphProject();
const files = await findFilesWithClasses(keys(classesToReplace));
const classesMap = new Map(entries(classesToReplace));

pipe(
  files,
  getStringLiteralsFromFiles(project),
  forEach(replaceClassesForStringLiteral(classesMap)),
);

await project.save();
