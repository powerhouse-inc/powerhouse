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
  addClassesToStringLiteral,
  addPrefix,
  hasClasses,
  makeAncillaryClasses,
} from "./utils.js";

const project = makeTsMorphProject();
const classesToAdd: ClassNameRecord = pipe(
  {
    "bg-slate-600": "text-slate-100",
  },
  makeAncillaryClasses,
  mapKeys(addPrefix("dark:")),
  mapValues(addPrefix("dark:")),
);
const files = await findFilesWithClasses(keys(classesToAdd));
const classesMap = new Map(entries(classesToAdd));

pipe(
  files,
  getStringLiteralsFromFiles(project),
  filter(hasClasses(classesMap)),
  forEach(addClassesToStringLiteral(classesMap)),
);

await project.save();
