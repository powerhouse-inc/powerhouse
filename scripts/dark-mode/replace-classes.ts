import { entries, filter, forEach, fromKeys, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = pipe(
  [
    "dark:hover:bg-slate-500!",
    "dark:hover:text-slate-50!",
    "dark:border-slate-600!",
    "dark:group-focus-within:text-slate-50!",
    "dark:group-focus-within:placeholder:text-slate-300!",
    "dark:focus:bg-slate-700!",
    "dark:data-[invalid=true]:data-state:border-red-100!",
    "dark:data-[invalid=true]:data-[state=checked]:bg-red-100!",
    "dark:data-[invalid=true]:data-[state=indeterminate]:bg-red-100!",
    "dark:data-[invalid=true]:data-state:border-red-800!",
    "dark:data-[invalid=true]:data-[state=checked]:bg-red-800!",
    "dark:data-[invalid=true]:data-[state=indeterminate]:bg-red-800!",
    "dark:data-[invalid=true]:group-hover:border-red-50!",
    "dark:data-[invalid=true]:data-[state=checked]:group-hover:bg-red-50!",
    "dark:data-[invalid=true]:data-[state=indeterminate]:group-hover:bg-red-50!",
    "dark:text-slate-200!",
    "dark:data-[selected=true]:bg-slate-500!",
    "dark:border-slate-200!",
    "dark:bg-slate-50!",
    "dark:text-slate-900!",
    "dark:border-slate-50!",
    "dark:border-slate-100!",
    "dark:text-slate-50!",
    "dark:text-slate-300!",
    "dark:group-hover:text-red-100!",
    "dark:text-red-100!",
    "dark:text-slate-800!",
  ],
  fromKeys((k) => k.replace("!", "")),
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
