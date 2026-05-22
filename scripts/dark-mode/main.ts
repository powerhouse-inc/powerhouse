import { entries, filter, forEach, isNot, keys, mapValues, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { allMappings } from "./mappings.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import {
  addClassesToStringLiteral,
  addPrefix,
  hasClasses,
  hasDarkModeAlready,
} from "./utils.js";

const project = makeTsMorphProject();
const files = await findFilesWithClasses(keys(allMappings));
const lightToDarkMap = new Map(
  entries(mapValues(allMappings, addPrefix("dark:"))),
);

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
  // filter(isNot(hasDarkModeAlready)),
  filter(hasClasses(lightToDarkMap)),
  forEach(addClassesToStringLiteral(lightToDarkMap)),
);

await project.save();
