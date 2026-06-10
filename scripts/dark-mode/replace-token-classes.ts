import { entries, filter, flatMap, forEach, keys, map, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { tokenMappings } from "./token-mappings.js";
import { getStringLiterals, makeTsMorphProject } from "./ts-morph.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const project = makeTsMorphProject();
const files = await findFilesWithClasses(keys(tokenMappings));
const classesMap = new Map(entries(tokenMappings));
const sources = map(files, (f) => project.addSourceFileAtPath(f));

pipe(
  sources,
  flatMap(getStringLiterals),
  filter(hasClasses(classesMap)),
  forEach(replaceClassesForStringLiteral(classesMap)),
);

await project.save();
