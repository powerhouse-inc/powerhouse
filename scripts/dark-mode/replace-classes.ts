// #!/usr/bin/env node
import { entries, filter, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = {
  "divide-gray-200": "divide-border",
  "accent-gray-900": "accent-primary",
  "focus:ring-gray-900/20": "focus:ring-ring/20",
  "focus:ring-gray-900": "focus:ring-ring",
  "focus-visible:ring-gray-900": "focus-visible:ring-ring",
  "dark:focus-visible:ring-offset-slate-800":
    "focus-visible:ring-offset-background",
  "shadow-gray-900/4": "shadow-foreground/4",
  "text-white": "text-primary-foreground",
  "text-black": "text-foreground",
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
