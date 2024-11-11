import { dirname, resolve } from "path";
import schemaPath from "./schema.graphql";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { resolvers } from "./resolvers";
import { transmit, options } from "./listener";

const __dirname =
  import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(resolve(__dirname, schemaPath), "utf8");

export { typeDefs, resolvers, transmit, options };
