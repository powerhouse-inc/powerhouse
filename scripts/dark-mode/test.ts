import { writeFileSync } from "node:fs";
import { filter, map, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import { getStringLiteralClassNameList } from "./utils.js";

const files = await findFilesWithClasses([]);
const project = makeTsMorphProject();
const classes = pipe(
  files,
  getStringLiteralsFromFiles(project),
  filter((l) =>
    getStringLiteralClassNameList(l).some(
      (c) => c.includes("bg-slate-50") && !c.includes("dark"),
    ),
  ),
  map((l) => l.getSourceFile()),
  map((sf) => sf.getFilePath()),
);

writeFileSync("classes.json", JSON.stringify(classes));
