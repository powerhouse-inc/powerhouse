// #!/usr/bin/env node
import { entries, filter, forEach, keys, mapToObj, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = mapToObj(
  [
    "hover:bg-amber-50",
    "dark:hover:bg-amber-900",
    "hover:bg-gray-50",
    "dark:hover:bg-slate-800",
    "hover:text-gray-700",
    "dark:hover:text-slate-200",
    "hover:bg-gray-800",
    "dark:hover:bg-slate-100",
    "hover:bg-gray-900/10",
    "hover:bg-gray-100",
    "dark:hover:bg-slate-700",
    "hover:bg-blue-700",
    "dark:hover:bg-blue-200",
    "hover:text-blue-800",
    "dark:hover:text-blue-100",
    "hover:text-gray-600",
    "dark:hover:text-slate-300",
    "dark:hover:bg-slate-500",
    "dark:hover:text-slate-50",
    "hover:text-gray-900",
    "hover:text-gray-500",
    "dark:hover:text-slate-400",
    "hover:bg-gray-200",
    "dark:hover:bg-slate-600",
    "dark:hover:text-slate-100",
    "hover:text-red-900",
    "dark:hover:text-red-400",
    "hover:text-gray-800",
    "hover:text-orange-500",
    "dark:hover:text-orange-100",
    "hover:bg-gray-300",
    "hover:bg-orange-600",
    "hover:bg-blue-300",
    "dark:hover:bg-blue-600",
    "hover:border-gray-300",
    "dark:hover:border-slate-500",
    "hover:bg-blue-50",
    "dark:hover:bg-blue-900",
    "hover:bg-blue-100",
    "dark:hover:bg-blue-800",
    "hover:bg-yellow-100",
    "dark:hover:bg-yellow-800",
    "hover:text-red-700",
    "dark:hover:text-red-100",
    "hover:bg-blue-600",
    "dark:hover:bg-blue-300",
    "hover:text-purple-700",
    "dark:hover:text-purple-100",
    "hover:!bg-red-800",
    "hover:!bg-blue-800",
    "hover:!bg-purple-800",
    "hover:!bg-green-800",
    "hover:text-gray-200",
    "hover:border-gray-900",
    "dark:hover:border-slate-50",
    "hover:border-gray-600",
    "dark:hover:border-slate-300",
    "hover:bg-green-100",
    "dark:hover:bg-green-800",
    "hover:bg-gray-900",
    "dark:hover:bg-slate-50",
    "dark:hover:bg-slate-900",
    "hover:text-blue-900",
    "dark:hover:text-blue-900",
    "dark:hover:text-slate-500",
    "hover:bg-red-100",
    "dark:hover:bg-red-800",
    'hover:bg-gray-300"',
    "dark:hover:text-slate-600",
    "hover:bg-yellow-700",
    "dark:hover:bg-yellow-200",
  ],
  (c) => [c, "hover-hover"],
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
