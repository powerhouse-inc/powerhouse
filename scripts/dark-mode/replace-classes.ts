// #!/usr/bin/env node
import { entries, filter, forEach, keys, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const classesToReplace: ClassNameRecord = {
  "bg-gray-900/30": "bg-primary/30",
  "bg-gray-100": "bg-muted",
  "bg-gray-50": "bg-background",
  "bg-white": "bg-card",
  "text-gray-900": "text-foreground",
  "text-gray-600": "text-muted-foreground",
  "border-gray-300": "border-border",
  "hover:bg-gray-100": "hover:bg-muted",
  "focus-visible:ring-gray-400": "focus-visible:ring-ring",
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
