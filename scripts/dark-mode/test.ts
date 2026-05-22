import { writeFileSync } from "fs";
import { map, mapValues, values } from "remeda";
import { allMappings } from "./mappings.js";
import { addPrefix, dropLastPartOfClassName } from "./utils.js";

writeFileSync(
  "./test.json",
  JSON.stringify(
    map(
      values(mapValues(allMappings, addPrefix("dark:"))),
      dropLastPartOfClassName,
    ),
  ),
);
