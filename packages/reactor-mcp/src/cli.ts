import { init } from "./index.js";

init(process.argv.at(2)).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
