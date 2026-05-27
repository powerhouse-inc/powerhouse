import { writeFileSync } from "node:fs";
import { endsWith, filter, flatMap, pipe, unique } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import { getStringLiteralClassNameList } from "./utils.js";

const files = await findFilesWithClasses(["dark:"]);
const project = makeTsMorphProject();
const classes = pipe(
  files,
  getStringLiteralsFromFiles(project),
  flatMap(getStringLiteralClassNameList),
  filter((c) => c.includes("dark:")),
  filter(endsWith("!")),
  unique(),
);

console.log(classes);
const filesWithClasses = await findFilesWithClasses(classes);
writeFileSync("important-classes.json", JSON.stringify(classes));
