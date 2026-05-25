import {
  entries,
  filter,
  forEach,
  keys,
  mapKeys,
  mapValues,
  pipe,
} from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import {
  addPrefix,
  hasClasses,
  makeAncillaryClasses,
  replaceClassesForStringLiteral,
} from "./utils.js";

const classesToReplace: ClassNameRecord = pipe(
  {
    "border-slate-600": "border-slate-500",
  },
  makeAncillaryClasses,
  mapKeys(addPrefix("dark:")),
  mapValues(addPrefix("dark:")),
);
const project = makeTsMorphProject();
const files = await findFilesWithClasses(keys(classesToReplace));
const classesMap = new Map(entries(classesToReplace));

pipe(
  files,
  getStringLiteralsFromFiles(project),
  filter(hasClasses(classesMap)),
  forEach(replaceClassesForStringLiteral(classesMap)),
);

await project.save();
