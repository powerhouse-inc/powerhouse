import { forEach, pipe, unique } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import {
  getStringLiteralsFromFiles,
  makeTsMorphProject,
  maybeUpdateStringLiteral,
} from "./ts-morph.js";
import {
  getStringLiteralClassNameList,
  makeClassNameStringFromList,
} from "./utils.js";

const neutralHoverBg = /^(group-)?(dark:)?hover:bg-(gray|slate)-\d+(\/\d+)?!?$/;

const project = makeTsMorphProject();
const files = await findFilesWithClasses(["hover:bg-gray", "hover:bg-slate"]);

pipe(
  files,
  getStringLiteralsFromFiles(project),
  forEach((s) => {
    const classes = getStringLiteralClassNameList(s);
    if (!classes.some((c) => neutralHoverBg.test(c))) return;
    const next = unique([
      ...classes.filter((c) => !neutralHoverBg.test(c)),
      "hover-hover",
    ]);
    maybeUpdateStringLiteral(s)(makeClassNameStringFromList(next));
  }),
);

await project.save();
