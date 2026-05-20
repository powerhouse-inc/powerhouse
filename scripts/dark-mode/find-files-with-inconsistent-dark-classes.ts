import {
  entries,
  filter,
  flat,
  flatMap,
  groupBy,
  invert,
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
  addDarkPrefixToClass,
  getStringLiteralClassNameList,
  hasClasses,
  hasDarkModeAlready,
} from "./utils.js";

const darkToLightMap = new Map(
  entries(invert(mapValues(allMappings, addDarkPrefixToClass))),
);
const allFilesWithDarkPrefixClasses = await findFilesWithClasses(["dark:"]);
const project = makeTsMorphProject();
const colorsToChange = [
  // "slate",
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
  filter(isNot(hasClasses(darkToLightMap))),
  flatMap((s) => ({
    s,
    file: s.getSourceFile().getFilePath(),
    classNames: filter(
      getStringLiteralClassNameList(s),
      (cn) =>
        startsWith(cn, "dark:") && colorsToChange.some((e) => cn.includes(e)),
    ),
  })),
  groupBy((v) => v.file),
  mapValues((v) => flatMap(v, ({ classNames, s }) => ({ s, classNames }))),
);

const filesToInspect = unique(keys(result));
const classesToChange = unique(
  flatMap(flat(values(result)), (v) => v.classNames),
);
console.log({
  filesToInspect,
  classesToChange,
  filesToInspectLength: filesToInspect.length,
  classesToChangeLength: classesToChange.length,
});
