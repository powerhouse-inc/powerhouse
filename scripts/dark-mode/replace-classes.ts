import { entries, filter, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = {
  "dark:border-gray-800": "dark:border-slate-800",
  "dark:group-hover/sidebar-resizer:bg-gray-600":
    "dark:group-hover/sidebar-resizer:bg-slate-600",
  "dark:bg-gray-600": "dark:bg-slate-600",
  "dark:bg-gray-900": "dark:bg-slate-900",
  "dark:hover:bg-gray-600": "dark:hover:bg-slate-600",
  "dark:bg-gray-800": "dark:bg-slate-800",
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
