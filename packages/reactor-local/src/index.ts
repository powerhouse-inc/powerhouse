import { startServer } from "./server.js";

export * from "./server.js";

startServer({ dev: true }).catch((error: unknown) => {
  throw error;
});
