import { entries, filter, forEach, pipe } from "remeda";
import { findFilesWithClasses } from "./find-files-with-classes.js";
import { getStringLiteralsFromFiles, makeTsMorphProject } from "./ts-morph.js";
import {
  getStringLiteralClassNameList,
  replaceClassesForStringLiteral,
} from "./utils.js";

const project = makeTsMorphProject();
const files = await findFilesWithClasses(["bg-gray-50"]);

const toReplace = new Map(entries({ "bg-gray-50": "bg-white" }));

const result = pipe(
  files,
  getStringLiteralsFromFiles(project),
  filter(
    (l) =>
      getStringLiteralClassNameList(l).some((c) =>
        c.includes("dark:bg-slate-600"),
      ) &&
      getStringLiteralClassNameList(l).some((c) => c.includes("bg-gray-50")),
  ),
  forEach(replaceClassesForStringLiteral(toReplace)),
  // forEach((s) => {
  //   const classes = getStringLiteralClassNameList(s);
  //   if (!classes.includes("bg-gray-50")) return;
  //   const target = classes.includes("dark:bg-slate-600")
  //     ? "bg-card"
  //     : "bg-background";
  //   const next = classes.map((c) => (c === "bg-gray-50" ? target : c));
  //   maybeUpdateStringLiteral(s)(makeClassNameStringFromList(next));
  // }),
);
console.log(result);
await project.save();
