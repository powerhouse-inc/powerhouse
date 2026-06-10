// #!/usr/bin/env node
import { entries, filter, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = {
  "data-[state=checked]:group-hover:bg-gray-900":
    "data-[state=checked]:group-hover:effect",
  "data-[state=indeterminate]:group-hover:bg-gray-900":
    "data-[state=indeterminate]:group-hover:effect",
  "dark:data-[state=checked]:group-hover:bg-slate-50":
    "dark:data-[state=checked]:group-hover:effect",
  "dark:data-[state=indeterminate]:group-hover:bg-slate-50":
    "dark:data-[state=indeterminate]:group-hover:effect",
  "data-[invalid=true]:data-[state=checked]:group-hover:bg-red-900!":
    "data-[invalid=true]:data-[state=checked]:group-hover:effect",
  "data-[invalid=true]:data-[state=indeterminate]:group-hover:bg-red-900!":
    "data-[invalid=true]:data-[state=indeterminate]:group-hover:effect",
  "dark:data-[invalid=true]:data-[state=checked]:group-hover:bg-red-50!":
    "dark:data-[invalid=true]:data-[state=checked]:group-hover:effect",
  "dark:data-[invalid=true]:data-[state=indeterminate]:group-hover:bg-red-50!":
    "dark:data-[invalid=true]:data-[state=indeterminate]:group-hover:effect",
  "group-hover:placeholder:text-gray-700": "group-hover:placeholder:effect",
  "dark:group-hover:placeholder:text-slate-500":
    "dark:group-hover:placeholder:effect",
  "group-hover/sidebar-resizer:bg-gray-500":
    "group-hover/sidebar-resizer:effect",
  "dark:group-hover/sidebar-resizer:bg-slate-600":
    "dark:group-hover/sidebar-resizer:effect",
  "group-hover:after:bg-gray-900": "group-hover:after:effect",
  "dark:group-hover:after:bg-slate-50": "dark:group-hover:after:effect",
  "peer-hover:text-gray-900": "peer-hover:effect",
  "dark:peer-hover:text-slate-50": "dark:peer-hover:effect",
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
