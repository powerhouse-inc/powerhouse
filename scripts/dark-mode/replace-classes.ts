import { entries, filter, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = {
  "hover:bg-slate-100": "hover:bg-gray-100",
  "border-slate-100": "border-gray-100",
  "border-slate-200": "border-gray-200",
  "text-slate-800": "text-gray-800",
  "hover:bg-slate-50": "hover:bg-gray-50",
  "text-slate-200": "text-gray-200",
  "text-slate-300": "text-gray-300",
  "text-slate-500": "text-gray-500",
  "text-slate-50": "text-gray-50",
  "border-slate-50": "border-gray-50",
  "active:border-slate-100": "active:border-gray-100",
  "hover:bg-slate-800": "hover:bg-gray-800",
  "active:border-slate-700": "active:border-gray-700",
  "disabled:text-slate-100": "disabled:text-gray-100",
  "bg-slate-900/50": "bg-slatgray/50",
  "data-[state=checked]:text-slate-50": "data-[state=checked]:text-gray-50",
  "data-[state=indeterminate]:text-slate-50":
    "data-[state=indeterminate]:text-gray-50",
  "text-slate-100": "text-gray-100",
  "hover:text-slate-200": "hover:text-gray-200",
  "bg-slate-100": "bg-gray-100",
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
