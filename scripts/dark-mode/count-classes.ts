import {
  countBy,
  entries,
  filter,
  flatMap,
  groupByProp,
  identity,
  keys,
  map,
  mapValues,
  pipe,
  values,
} from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { colorMappings } from "./mappings.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import {
  addPrefix,
  getStringLiteralClassNameList,
  hasClass,
  hasClasses,
} from "./utils.js";

const lightClasses = new Set([...keys(colorMappings)]);
const darkClasses = new Set([
  ...values(mapValues(colorMappings, addPrefix("dark:"))),
]);

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
    groupByProp("count"),
    mapValues((vs) => map(vs, ({ className }) => className)),
  );

const lightCount = await countClasses(lightClasses);
const darkCount = await countClasses(darkClasses);

console.log(lightCount);
console.log(darkCount);
