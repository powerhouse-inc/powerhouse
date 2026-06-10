import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  countBy,
  drop,
  entries,
  filter,
  flatMap,
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
const colorClasses = ["bg-", "text-", "border-"];
const excludes = [
  "xs",
  "sm",
  "base",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "border-t",
  "border-b",
  "border-0",
  "border-l",
  "border-r",
  "border-x",
  "border-y",
  "border-none",
  "border-color",
  "border-2",
  "inherit",
  "dashed",
  "dotted",
  "px",
  "transparent",
  "left",
  "right",
  "center",
  "current",
  "collapse",
  "solid",
  ".",
  "text-decoration",
  "text-start",
  ":effect",
  "foreground",
  "<",
  ">",
  "=",
];
const allClasses = pipe(
  await findFilesWithClasses(colorClasses),
  getStringLiteralsFromFiles(project),
  flatMap(getStringLiteralClassNameList),
  filter((c) => colorClasses.some((cc) => c.includes(cc))),
  filter((c) => !excludes.some((e) => c.includes(e))),
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

writeFileSync(
  path.join(process.cwd(), "all-classes.json"),
  JSON.stringify(
    { allClasses: unique(allClasses), lightCounts, darkCounts, withOpacity },
    null,
    2,
  ),
);
