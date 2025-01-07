import { startServer } from "./server";

export * from "./server";

startServer({ dev: true }).catch((error: unknown) => {
  throw error;
});
