import { entries, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = {
  "dark:text-gray-400": "dark:text-slate-400",
  "dark:text-gray-500": "dark:text-slate-500",
  "dark:border-gray-400": "dark:border-slate-400",
  "dark:hover:border-gray-50": "dark:hover:border-slate-50",
  "dark:border-gray-600": "dark:border-slate-600",
  "dark:hover:border-gray-600": "dark:hover:border-slate-600",
  "dark:after:bg-gray-400": "dark:after:bg-slate-400",
  "dark:group-hover:after:bg-gray-50": "dark:group-hover:after:bg-slate-50",
  "dark:after:bg-gray-600": "dark:after:bg-slate-600",
  "dark:peer-hover:text-gray-50": "dark:peer-hover:text-slate-50",
  "dark:border-gray-900": "dark:border-slate-900",
  "dark:text-gray-200": "dark:text-slate-200",
  "dark:border-b-gray-900": "dark:border-b-slate-900",
  "dark:hover:border-b-gray-800": "dark:hover:border-b-slate-800",
  "dark:hover:bg-gray-900": "dark:hover:bg-slate-900",
  "dark:focus-within:border-b-gray-800": "dark:focus-within:border-b-slate-800",
  "dark:focus-within:bg-gray-900": "dark:focus-within:bg-slate-900",
  "dark:text-gray-700": "dark:text-slate-700",
  "dark:group-hover:text-gray-500": "dark:group-hover:text-slate-500",
  "dark:group-focus-within:text-gray-50!":
    "dark:group-focus-within:text-slate-50!",
  "dark:placeholder:text-gray-700": "dark:placeholder:text-slate-700",
  "dark:group-hover:placeholder:text-gray-500":
    "dark:group-hover:placeholder:text-slate-500",
  "dark:group-focus-within:placeholder:text-gray-300!":
    "dark:group-focus-within:placeholder:text-slate-300!",
  "dark:disabled:data-[invalid=false]:data-[state=checked]:bg-gray-500":
    "dark:disabled:data-[invalid=false]:data-[state=checked]:bg-slate-500",
  "dark:disabled:data-[invalid=false]:data-[state=indeterminate]:bg-gray-500":
    "dark:disabled:data-[invalid=false]:data-[state=indeterminate]:bg-slate-500",
  "dark:data-state:border-gray-500": "dark:data-state:border-slate-500",
  "dark:data-[state=checked]:bg-gray-400":
    "dark:data-[state=checked]:bg-slate-400",
  "dark:data-[state=indeterminate]:bg-gray-400":
    "dark:data-[state=indeterminate]:bg-slate-400",
  "dark:data-[state=checked]:text-gray-900":
    "dark:data-[state=checked]:text-slate-900",
  "dark:data-[state=indeterminate]:text-gray-900":
    "dark:data-[state=indeterminate]:text-slate-900",
  "dark:text-gray-600": "dark:text-slate-600",
  "dark:data-[selected=true]:bg-gray-900":
    "dark:data-[selected=true]:bg-slate-900",
  "dark:text-gray-50": "dark:text-slate-50",
  "dark:text-gray-300": "dark:text-slate-300",
  "dark:hover:text-gray-500": "dark:hover:text-slate-500",
  "dark:bg-gray-400": "dark:bg-slate-400",
  "dark:placeholder:text-gray-600": "dark:placeholder:text-slate-600",
} as const;
const project = makeTsMorphProject();
const files = await findFilesWithClasses(keys(classesToReplace));
const classesMap = new Map(entries(classesToReplace));

pipe(
  files,
  getStringLiteralsFromFiles(project),
  forEach(replaceClassesForStringLiteral(classesMap)),
);

await project.save();
