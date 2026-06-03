import {
  concat,
  entries,
  filter,
  flat,
  flatMap,
  forEach,
  keys,
  map,
  mergeAll,
  pipe,
} from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import type { ClassNameRecord } from "./types.js";
import { hasClasses, replaceClassesForStringLiteral } from "./utils.js";

const colorNumberMap: Record<number, number> = {
  50: 300,
  100: 300,
  200: 300,
  300: 300,
  400: 300,
  500: 500,
  600: 500,
  700: 800,
  800: 800,
  900: 800,
};

const mappingColors = ["blue", "green", "purple", "red", "orange", "yellow"];

const colorSubstitions: Record<string, string> = {
  amber: "orange",
  violet: "purple",
  charcoal: "slate",
  cyan: "blue",
};

function makeColorMapping(color: string, number: string, type: string) {
  const substitutionColor = colorSubstitions[color] ?? color;
  return {
    [`${type}-${color}-${number}`]: `${type}-${substitutionColor}-${colorNumberMap[Number(number)]}`,
    [`dark:${type}-${color}-${number}`]: `dark:${type}-${substitutionColor}-${colorNumberMap[Number(number)]}`,
  };
}

const grays = {
  // background
  "bg-white": "bg-gray-50",
  "text-gray-50": "text-white",
  "text-gray-100": "text-white",
  "text-gray-200": "text-gray-400",
  "text-gray-300": "text-gray-400",
  "text-gray-400": "text-gray-500",
  "text-gray-500": "text-gray-500",
  "text-gray-600": "text-gray-700",
  "text-gray-700": "text-gray-700",
  "text-gray-800": "text-gray-800",
  "text-gray-900": "text-gray-800",
  "dark:text-white": "dark:text-white",
  "dark:text-slate-50": "dark:text-slate-100",
  "dark:text-slate-100": "dark:text-slate-100",
  "dark:text-slate-200": "dark:text-slate-200",
  "dark:text-slate-300": "dark:text-slate-200",
  "dark:text-slate-400": "dark:text-slate-400",
  "dark:text-slate-500": "dark:text-slate-500",
  "dark:text-slate-600": "dark:text-slate-500",
  "dark:text-slate-700": "dark:text-slate-500",
  "dark:text-slate-800": "dark:text-slate-500",
  "dark:text-slate-900": "dark:text-slate-500",
};

const allColors = concat(mappingColors, keys(colorSubstitions));
const mappings = pipe(
  allColors,
  flatMap((color) =>
    map(keys(colorNumberMap), (number) =>
      makeColorMapping(color, number, "bg"),
    ),
  ),
  flat(),
  (o) => mergeAll(o),
);

const classesToReplace: ClassNameRecord = mappings;

const project = makeTsMorphProject();
const files = await findFilesWithClasses(keys(classesToReplace));
const classesMap = new Map(entries(classesToReplace));

pipe(
  files,
  getStringLiteralsFromFiles(project),
  filter(hasClasses(classesMap)),
  forEach(replaceClassesForStringLiteral(classesMap)),
);

await project.save();
