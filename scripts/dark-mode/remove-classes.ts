// #!/usr/bin/env node
import { filter, forEach, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import { hasClasses, removeClassesFromStringLiteral } from "./utils.js";

const classesToRemove = [
  "dark:bg-slate-900/70",
  "dark:bg-slate-900",
  "dark:bg-slate-800",
  "dark:bg-slate-700",
  "dark:text-slate-50",
  "dark:text-slate-300",
  "dark:border-slate-600",
  "dark:hover:bg-slate-700",
];

const set = new Set(classesToRemove);

const project = makeTsMorphProject();
const files = await findFilesWithClasses(classesToRemove);

pipe(
  files,
  getStringLiteralsFromFiles(project),
  filter(hasClasses(set)),
  forEach(removeClassesFromStringLiteral(classesToRemove)),
);

await project.save();
