// #!/usr/bin/env node
import { entries, filter, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = {
  "bg-orange-100": "bg-orange-50",
  "dark:text-orange-100": "dark:text-orange-50",
  "border-orange-100": "border-orange-50",
  "dark:text-red-100": "dark:text-red-50",
  "dark:text-blue-100": "dark:text-blue-50",
  "text-orange-100": "text-orange-50",
  "dark:border-orange-100": "dark:border-orange-50",
  "bg-blue-100": "bg-blue-50",
  "dark:text-green-100": "dark:text-green-50",
  "dark:bg-green-100": "dark:bg-green-50",
  "bg-red-100": "bg-red-50",
  "bg-green-100": "bg-green-50",
  "bg-yellow-100": "bg-yellow-50",
  "dark:text-yellow-100": "dark:text-yellow-50",
  "dark:bg-blue-100": "dark:bg-blue-50",
  "dark:text-purple-100": "dark:text-purple-50",
  "dark:after:bg-blue-100": "dark:after:bg-blue-50",
  "dark:data-[invalid=true]:data-state:border-red-100!":
    "dark:data-[invalid=true]:data-state:border-red-50!",
  "dark:data-[invalid=true]:data-[state=checked]:bg-red-100!":
    "dark:data-[invalid=true]:data-[state=checked]:bg-red-50!",
  "dark:data-[invalid=true]:data-[state=indeterminate]:bg-red-100!":
    "dark:data-[invalid=true]:data-[state=indeterminate]:bg-red-50!",
  "dark:before:bg-red-100": "dark:before:bg-red-50",
  "dark:before:bg-blue-100": "dark:before:bg-blue-50",
  "dark:before:bg-orange-100": "dark:before:bg-orange-50",
  "dark:border-red-100": "dark:border-red-50",
  "dark:bg-red-100": "dark:bg-red-50",
  "dark:active:border-red-100": "dark:active:border-red-50",
  "dark:disabled:text-red-100": "dark:disabled:text-red-50",
  "dark:active:border-blue-100": "dark:active:border-blue-50",
  "dark:disabled:text-blue-100": "dark:disabled:text-blue-50",
  "dark:bg-yellow-100": "dark:bg-yellow-50",
  "border-green-100": "border-green-50",
  "bg-purple-100": "bg-purple-50",
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
