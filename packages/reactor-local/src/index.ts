import { startServer } from "./server";

export * from "./server";

startServer({ dev: true, dbPath: "postgresql://postgres:password@localhost:5555/analytics" }).catch((error: unknown) => {
  throw error;
});
