import { writeFileSync } from "node:fs";
import path from "node:path";
import { filter, flatMap, isTruthy, last, map, pipe, unique } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import { getStringLiteralClassNameList } from "./utils.js";

const project = makeTsMorphProject();
const colorClasses = ["bg-", "text-", "border-", ":effect"];
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
  "dashed",
  "dotted",
  "px",
  "transparent",
  "left",
  "right",
  "center",
  "current",
];
const allClasses = pipe(
  await findFilesWithClasses(colorClasses),
  getStringLiteralsFromFiles(project),
  flatMap(getStringLiteralClassNameList),
  unique(),
  filter((c) => colorClasses.some((cc) => c.includes(cc))),
  filter((c) => !excludes.some((e) => c.includes(e))),
);

const withoutPrefixes = pipe(
  allClasses,
  map((c) => last(c.split(":"))),
  filter(isTruthy),
);

const colors = pipe(
  withoutPrefixes,
  map((c) => c.split("-").at(1)),
  filter(isTruthy),
  filter((c) => !c.includes("/")),
  unique(),
);

const hover = pipe(
  allClasses,
  filter(
    // (c) => c.startsWith("group-hover") || c.startsWith("dark:group-hover"),
    (c) => c.includes("hover"),
  ),
  unique(),
);

writeFileSync(
  path.join(process.cwd(), "all-classes.json"),
  JSON.stringify({ allClasses, withoutPrefixes, colors, hover }, null, 2),
);
