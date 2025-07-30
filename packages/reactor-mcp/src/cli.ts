import { init } from "./index.js";

init().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
