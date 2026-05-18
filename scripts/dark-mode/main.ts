import { filter, flatMap, forEach, isNot, map, pipe } from "remeda";
import { excludePatterns } from "./constants.js";
import { findDarkModeCandidates } from "./find-dark-mode-candidates.js";
import { lightToDarkMap } from "./mappings.js";
import {
  addFileToProcess,
  getStringLiterals,
  makeTsMorphProject,
} from "./ts-morph.js";
import {
  hasDarkModeAlready,
  hasLightMode,
  maybeAddNewClasses,
  shouldProcess,
} from "./utils.js";

const project = makeTsMorphProject();
const files = await findDarkModeCandidates();

/**
 * Migrates candidate string literals by adding generated dark-mode classes when:
 *
 * - the file is not excluded,
 * - the literal does not already contain an explicit `dark:` class,
 * - and the literal contains at least one configured light-mode class.
 */
pipe(
  files,
  filter(shouldProcess(excludePatterns)),
  map(addFileToProcess(project)),
  flatMap(getStringLiterals),
  filter(isNot(hasDarkModeAlready)),
  filter(hasLightMode(lightToDarkMap)),
  forEach(maybeAddNewClasses(lightToDarkMap)),
);

await project.save();
