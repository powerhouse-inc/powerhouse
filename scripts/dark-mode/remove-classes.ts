// #!/usr/bin/env node
import { filter, forEach, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import { hasClasses, removeClassesFromStringLiteral } from "./utils.js";

const classesToRemove = [
  "dark:divide-slate-500",
  "dark:focus:ring-slate-300",
  "dark:focus-visible:ring-slate-300",
  "dark:focus-visible:ring-slate-400",
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
