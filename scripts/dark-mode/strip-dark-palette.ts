import { flatMap, forEach, map, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import {
  getStringLiterals,
  makeTsMorphProject,
  maybeUpdateStringLiteral,
} from "./ts-morph.js";
import {
  getStringLiteralClassNameList,
  makeClassNameStringFromList,
} from "./utils.js";

const tokenizedHue =
  /-(gray|slate|blue|green|red|orange|yellow|amber)-\d+(\/\d+)?!?$/;
const isDarkPalette = (c: string) =>
  c.includes("dark:") && tokenizedHue.test(c);

const project = makeTsMorphProject();
const files = await findFilesWithClasses(["dark:"]);
const sources = map(files, (f) => project.addSourceFileAtPath(f));

pipe(
  sources,
  flatMap(getStringLiterals),
  forEach((s) => {
    const next = getStringLiteralClassNameList(s).filter(
      (c) => !isDarkPalette(c),
    );
    maybeUpdateStringLiteral(s)(makeClassNameStringFromList(next));
  }),
);

await project.save();
