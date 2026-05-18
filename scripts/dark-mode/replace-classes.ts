import { entries, flatMap, forEach, keys, map, pipe, unique } from "remeda";
import type { StringLiteral } from "ts-morph";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import {
  addFileToProcess,
  getStringLiterals,
  getStringLiteralText,
  makeTsMorphProject,
  maybeUpdateStringLiteral,
} from "./ts-morph.js";
import type { ClassName } from "./types.js";
import {
  makeClassNameListFromString,
  makeClassNameStringFromList,
} from "./utils.js";

type ClassesMap = Map<ClassName, ClassName>;

const getClassToReplace = (m: ClassesMap, c: ClassName) => m.get(c);

const replaceClass = (m: ClassesMap) => (c: ClassName) =>
  getClassToReplace(m, c) ?? c;

const maybeReplaceClasses = (m: ClassesMap) => (s: StringLiteral) =>
  pipe(
    s,
    getStringLiteralText,
    makeClassNameListFromString,
    map(replaceClass(m)),
    unique(),
    makeClassNameStringFromList,
    maybeUpdateStringLiteral(s),
  );

const classesToReplace: Record<ClassName, ClassName> = {} as const;
const project = makeTsMorphProject();
const files = await findFilesWithClasses(keys(classesToReplace));
const classesMap = new Map(entries(classesToReplace));

pipe(
  files,
  map(addFileToProcess(project)),
  flatMap(getStringLiterals),
  forEach(maybeReplaceClasses(classesMap)),
);

await project.save();
