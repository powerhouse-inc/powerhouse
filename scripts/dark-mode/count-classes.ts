import { writeFileSync } from "node:fs";
import {
  countBy,
  entries,
  filter,
  flatMap,
  groupBy,
  groupByProp,
  identity,
  keys,
  map,
  mapValues,
  pipe,
} from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { bg, border, text } from "./mappings.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import {
  addPrefix,
  getStringLiteralClassNameList,
  hasClass,
  hasClasses,
} from "./utils.js";
import path from "node:path";

const bgLight = new Set(keys(bg));
const borderLight = new Set(keys(border));
const textLight = new Set(keys(text));
const bgDark = new Set(map([...bgLight], addPrefix("dark:")));
const borderDark = new Set(map([...borderLight], addPrefix("dark:")));
const textDark = new Set(map([...textLight], addPrefix("dark:")));

const project = makeTsMorphProject();

const countClasses = async (toCount: Set<string>) =>
  pipe(
    await findFilesWithClasses([...toCount]),
    getStringLiteralsFromFiles(project),
    filter(hasClasses(toCount)),
    flatMap(getStringLiteralClassNameList),
    filter(hasClass(toCount)),
    countBy(identity()),
    entries(),
    map(([className, count]) => ({
      className,
      count,
    })),
    groupBy(({ className }) => className.split("-")[1]),
    mapValues(groupByProp("count")),
    mapValues((vs) =>
      mapValues(vs, (v) => flatMap(v, ({ className }) => className)),
    ),
  );

const bgLightCount = await countClasses(bgLight);
const borderLightCount = await countClasses(borderLight);
const textLightCount = await countClasses(textLight);
const bgDarkCount = await countClasses(bgDark);
const borderDarkCount = await countClasses(borderDark);
const textDarkCount = await countClasses(textDark);

const counts = {
  bgLightCount,
  borderLightCount,
  textLightCount,
  bgDarkCount,
  borderDarkCount,
  textDarkCount,
};

writeFileSync(
  path.join(process.cwd(), "class-count.json"),
  JSON.stringify(counts, null, 2),
);
