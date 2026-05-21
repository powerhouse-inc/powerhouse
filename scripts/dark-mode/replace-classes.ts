import { entries, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = {
  "dark:border-charcoal-700": "dark:border-slate-700",
  "dark:bg-charcoal-900": "dark:bg-slate-900",
  "dark:focus:bg-charcoal-900": "dark:focus:bg-slate-900",
  "dark:focus-visible:ring-charcoal-300": "dark:focus-visible:ring-slate-300",
  "dark:focus-visible:ring-offset-charcoal-900":
    "dark:focus-visible:ring-offset-slate-900",
  "dark:hover:border-charcoal-700": "dark:hover:border-slate-700",
  "dark:hover:bg-charcoal-800": "dark:hover:bg-slate-800",
  "dark:focus:ring-charcoal-300": "dark:focus:ring-slate-300",
  "dark:hover:bg-charcoal-900": "dark:hover:bg-slate-900",
  "dark:scrollbar-thumb-charcoal-700": "dark:scrollbar-thumb-slate-700",
  "dark:hover:scrollbar-thumb-charcoal-700":
    "dark:hover:scrollbar-thumb-slate-700",
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
