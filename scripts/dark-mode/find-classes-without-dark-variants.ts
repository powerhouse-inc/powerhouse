import {
  filter,
  flat,
  flatMap,
  groupByProp,
  isIncludedIn,
  isNot,
  isTruthy,
  keys,
  map,
  mapValues,
  pipe,
  sort,
  split,
  unique,
  values,
} from "remeda";
import type { StringLiteral } from "ts-morph";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { allMappings, colorMappings } from "./mappings.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import {
  getStringLiteralClassNameList,
  hasClass,
  makeClassNameListFromString,
  makeClassNameStringFromList,
} from "./utils.js";

const inlcudes = ["border", "text", "bg"];
const exludes = ["."];
const toRemove = [
  "center",
  "start",
  "end",
  "left",
  "right",
  "current",
  "subgraph",
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "border-0",
  "border-box",
  "border-solid",
  "border-none",
  "border-collapse",
  "text-inherit",
  "bg-inherit",
  "border-inherit",
  "border-color",
  "bg-transparent",
  "border-t",
  "border-b",
  "border-y",
  "border-2",
  "border-dashed",
  "event-stream",
  "document",
];
const project = makeTsMorphProject();
const files = await findFilesWithClasses(inlcudes);
const remove = (s: StringLiteral) =>
  pipe(
    s,
    getStringLiteralClassNameList,
    filter((c) => !isIncludedIn(c, toRemove)),
    makeClassNameStringFromList,
  );

const result = pipe(
  files,
  getStringLiteralsFromFiles(project),
  map((s) => ({
    s,
    text: remove(s),
  })),
  filter(
    ({ text }) =>
      !text.includes("dark:") &&
      !exludes.some((e) => text.includes(e)) &&
      inlcudes.some((i) => text.includes(i)),
  ),
  map(({ s, text }) => ({
    filePath: s.getSourceFile().getFilePath(),
    text: pipe(
      text,
      makeClassNameListFromString,
      filter(
        (c) =>
          !toRemove.some((e) => c.includes(e)) &&
          inlcudes.some((i) => c.includes(i)) &&
          c.includes("-"),
      ),
      makeClassNameStringFromList,
    ),
  })),
  filter(({ text }) => isTruthy(text)),
  groupByProp("filePath"),
  mapValues((vs) => flatMap(vs, ({ text }) => text)),
);

const filePaths = unique(keys(result));
const classes = pipe(
  values(result),
  flat(),
  map(split(" ")),
  flat(),
  unique(),
  filter(isNot(hasClass(new Set(keys(allMappings))))),
  sort((a, b) => b.localeCompare(a)),
);
const textClasses = filter(classes, (c) => c.includes("text"));
const bgClasses = filter(classes, (c) => c.includes("bg"));
const borderClasses = filter(classes, (c) => c.includes("border"));

console.log({
  textClasses,
  bgClasses,
  borderClasses,
});
