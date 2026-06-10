// #!/usr/bin/env node
import { concat, forEach, map, pipe, values } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { allMappings } from "./mappings.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import { addPrefix, removeClassesFromStringLiteral } from "./utils.js";

const classesToRemove = pipe(
  values(allMappings),
  map(addPrefix("dark:")),
  concat([
    "dark:bg-blue-900/30",
    "dark:bg-blue-900/20",
    "dark:text-black",
    "dark:bg-red-900/20",
    "dark:hover:bg-blue-900/30",
    "dark:hover:bg-blue-900/20",
    "dark:hover:bg-yellow-900/30",
    "dark:bg-yellow-900/20",
    "dark:bg-yellow-800",
    "dark:bg-yellow-900/30",
    "dark:hover:bg-red-900/30",
    "dark:bg-red-900/30",
    "dark:bg-black/90",
  ]),
);

const project = makeTsMorphProject();
const files = await findFilesWithClasses(["dark:"]);

pipe(
  files,
  getStringLiteralsFromFiles(project),
  forEach(removeClassesFromStringLiteral(classesToRemove)),
);

await project.save();
