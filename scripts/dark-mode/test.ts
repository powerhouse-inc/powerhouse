// import { writeFileSync } from "node:fs";
// import { filter, flatMap, pipe, unique } from "remeda";
// import { findFilesWithClasses } from "./find-files-with-classes.js";
// import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
// import { getStringLiteralClassNameList } from "./utils.js";

import { writeFileSync } from "fs";
import { filter, keys, map, pipe, prop, unique, uniqueBy } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { colorMappings } from "./mappings.js";
import {
  addFileToProcess,
  getStringLiterals,
  makeTsMorphProject,
} from "./ts-morph.js";
import { getStringLiteralClassNameList } from "./utils.js";

const colors = [
  "red",
  "yellow",
  "orange",
  "purple",
  "green",
  "amber",
  "blue",
  "zinc",
  "charcoal",
  "violet",
  "cyan",
];

const files = await findFilesWithClasses(keys(colorMappings));
const project = makeTsMorphProject();

const classes = pipe(
  files,
  map(addFileToProcess(project)),
  map((f) => ({
    path: f.getFilePath(),
    cs: unique(map(getStringLiterals(f), getStringLiteralClassNameList)),
  })),
  filter(({ cs }) =>
    cs.some((c) => colors.some((color) => c.includes(`text-${color}`))),
  ),
  uniqueBy(prop("path")),
);

// const filesWithClasses = await findFilesWithClasses(classes);
writeFileSync("classes.json", JSON.stringify(classes, null, 2));
