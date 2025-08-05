import { init } from "./index.js";

init({
  remoteDrive: process.argv.at(2),
  root: process.cwd(),
}).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
