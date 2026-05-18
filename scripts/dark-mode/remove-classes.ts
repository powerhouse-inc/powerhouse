import { difference, flatMap, forEach, map, pipe } from "remeda";
import type { StringLiteral } from "ts-morph";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import {
  addFileToProcess,
  getStringLiterals,
  getStringLiteralText,
  makeTsMorphProject,
  maybeUpdateStringLiteral,
} from "./ts-morph.js";
import type { ClassNameList } from "./types.js";
import {
  makeClassNameListFromString,
  makeClassNameStringFromList,
} from "./utils.js";

const removeClasses = (toRemove: ClassNameList) => (s: StringLiteral) =>
  pipe(
    s,
    getStringLiteralText,
    makeClassNameListFromString,
    difference(toRemove),
    makeClassNameStringFromList,
    maybeUpdateStringLiteral(s),
  );

const classesToRemove: ClassNameList = [];
const project = makeTsMorphProject();
const files = await findFilesWithClasses(classesToRemove);

pipe(
  files,
  map(addFileToProcess(project)),
  flatMap(getStringLiterals),
  forEach(removeClasses(classesToRemove)),
);

await project.save();
