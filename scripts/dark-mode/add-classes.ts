import { entries, filter, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { addClassesToStringLiteral, hasClasses } from "./utils.js";

const project = makeTsMorphProject();
const classesToAdd: ClassNameRecord = {} as const;
const files = await findFilesWithClasses(keys(classesToAdd));
const classesMap = new Map(entries(classesToAdd));

/**
 * Migrates candidate string literals by adding generated dark-mode classes when:
 *
 * - the file is not excluded,
 * - the literal does not already contain an explicit `dark:` class,
 * - and the literal contains at least one configured light-mode class.
 */
pipe(
  files,
  getStringLiteralsFromFiles(project),
  filter(hasClasses(classesMap)),
  forEach(addClassesToStringLiteral(classesMap)),
);

await project.save();
