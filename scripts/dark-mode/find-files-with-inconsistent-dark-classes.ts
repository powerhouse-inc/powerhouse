import {
  filter,
  flat,
  flatMap,
  groupBy,
  isNot,
  keys,
  mapValues,
  pipe,
  startsWith,
  unique,
  values,
} from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { allMappings } from "./mappings.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import {
  addPrefix,
  getStringLiteralClassNameList,
  hasClasses,
  hasDarkModeAlready,
} from "./utils.js";

const testSet = new Set(values(mapValues(allMappings, addPrefix("dark:"))));
const allFilesWithDarkPrefixClasses = await findFilesWithClasses(["dark:"]);
const project = makeTsMorphProject();
const colors = [
  "slate",
  // "red",
  // "green",
  // "blue",
  // "yellow",
  // "orange",
  // "black",
  // "white",
  // "transparent",
  "gray",
  "charcoal",
];

const result = pipe(
  allFilesWithDarkPrefixClasses,
  getStringLiteralsFromFiles(project),
  filter(hasDarkModeAlready),
  filter(isNot(hasClasses(testSet))),
  flatMap((s) => ({
    s,
    file: s.getSourceFile().getFilePath(),
    classNames: filter(getStringLiteralClassNameList(s), (cn) =>
      startsWith(cn, "dark:"),
    ),
  })),
  groupBy((v) => v.file),
  mapValues((v) => flatMap(v, ({ classNames, s }) => ({ s, classNames }))),
);

const filesToInspect = unique(keys(result));
const classesToChange = unique(
  flatMap(flat(values(result)), (v) => v.classNames),
);
const grayClasses = filter(classesToChange, (c) => c.includes("gray"));

console.log({
  filesToInspect,
  classesToChange,
  grayClasses,
  filesToInspectLength: filesToInspect.length,
  classesToChangeLength: classesToChange.length,
});
