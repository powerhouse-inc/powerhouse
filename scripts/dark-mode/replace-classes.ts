// #!/usr/bin/env node
import { entries, filter, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = {
  "border-gray-500": "border-gray-300",
  "dark:border-slate-400": "dark:border-slate-500",
  "border-gray-100": "border-gray-300",
  "border-gray-200": "border-gray-300",
  "border-gray-400": "border-gray-300",
  "dark:border-slate-600": "dark:border-slate-500",
  "border-gray-50": "border-gray-300",
  "active:border-gray-100": "active:border-gray-300",
  "active:border-gray-700": "active:border-gray-900",
  "dark:active:border-slate-200": "dark:active:border-slate-50",
  "disabled:border-gray-700": "disabled:border-gray-900",
  "dark:disabled:border-slate-200": "dark:disabled:border-slate-50",
  "data-state:border-gray-700": "data-state:border-gray-900",
  "dark:border-slate-800": "dark:border-slate-500",
  "border-gray-700": "border-gray-900",
  "dark:border-slate-200": "dark:border-slate-50",
  "border-gray-800": "border-gray-900",
  "dark:border-slate-100": "dark:border-slate-50",
  "dark:border-slate-300": "dark:border-slate-500",
};

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
