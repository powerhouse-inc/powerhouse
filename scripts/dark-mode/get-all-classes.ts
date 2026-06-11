import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  countBy,
  drop,
  entries,
  filter,
  flatMap,
  forEach,
  groupBy,
  identity,
  isTruthy,
  join,
  last,
  map,
  mapValues,
  pipe,
  unique,
} from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import { getStringLiteralClassNameList } from "./utils.js";

const project = makeTsMorphProject();
const colorClasses = ["bg", "text", "border"];
const excludes = [
  // "xs",
  // "sm",
  // "base",
  // "md",
  // "lg",
  // "xl",
  // "2xl",
  // "3xl",
  // "4xl",
  // "border-t",
  // "border-b",
  // "border-0",
  // "border-l",
  // "border-r",
  // "border-x",
  // "border-y",
  // "border-none",
  // "border-color",
  // "border-2",
  // "inherit",
  // "dashed",
  // "dotted",
  // "px",
  // "transparent",
  // "left",
  // "right",
  // "center",
  // "current",
  // "collapse",
  // "solid",
  // ".js",
  // "text-decoration",
  // "text-start",
  // ":effect",
  ">",
  '"',
  "</h3",
  "Documents",
  "Folders",
  "className=",
];

const colorNames = [
  "red",
  "blue",
  "yellow",
  "orange",
  "green",
  "purple",
  "transparent",
];
const grayScaleNames = ["black", "white", "slate", "gray"];
const allColorNames = [...colorNames, ...grayScaleNames];
const allClasses = pipe(
  await findFilesWithClasses(colorClasses),
  getStringLiteralsFromFiles(project),
  flatMap(getStringLiteralClassNameList),
  filter((c) => map(colorClasses, (c) => `${c}-`).some((cc) => c.includes(cc))),
  filter((c) =>
    map(allColorNames, (c) => `-${c}`).some((cc) => c.includes(cc)),
  ),
  map((c) => {
    let result = c;
    forEach(excludes, (e) => (result = result.replaceAll(e, "")));
    return result;
  }),
);

const light = pipe(
  allClasses,
  filter((c) => !c.includes("dark")),
  map((c) => last(c.split(":"))),
  filter(isTruthy),
);

const dark = pipe(
  allClasses,
  filter((c) => c.includes("dark")),
  map((c) => last(c.split(":"))),
  filter(isTruthy),
);

const lightCounts = pipe(
  light,
  map((c) => drop(c.split("-"), 1)),
  map(join("-")),
  filter(isTruthy),
  countBy(identity()),
  entries(),
  groupBy(([_, k]) => k),
  mapValues((vs) => flatMap(vs, ([v, _]) => v)),
);

const darkCounts = pipe(
  dark,
  map((c) => drop(c.split("-"), 1)),
  map(join("-")),
  filter(isTruthy),
  countBy(identity()),
  entries(),
  groupBy(([_, k]) => k),
  mapValues((vs) => flatMap(vs, ([v, _]) => v)),
);

const withOpacity = pipe(
  [...light, ...dark],
  unique(),
  filter((c) => c.includes("/")),
);

const colorBgs = pipe(
  allClasses,
  filter((c) => c.includes("bg")),
  filter((c) => allColorNames.some((color) => c.includes(color))),
  unique(),
  groupBy((c) => (c.includes("dark") ? "dark" : "light")),
);

const borders = pipe(
  allClasses,
  filter((c) => c.includes("border")),
  unique(),
  groupBy((c) => (c.includes("dark") ? "dark" : "light")),
);

const grayscaleBorders = pipe(
  allClasses,
  filter((c) => c.includes("border")),
  filter((c) => grayScaleNames.some((n) => c.includes(n))),
  unique(),
  groupBy((c) => (c.includes("dark") ? "dark" : "light")),
);

writeFileSync(
  path.join(process.cwd(), "all-classes.json"),
  JSON.stringify(
    {
      allClasses: unique(allClasses),
      lightCounts,
      darkCounts,
      withOpacity,
      colorBgs,
      borders,
      grayscaleBorders,
    },
    null,
    2,
  ),
);
