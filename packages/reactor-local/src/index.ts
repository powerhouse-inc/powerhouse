import { startServer } from "./server.js";

export * from "./server.js";

startServer().catch((error: unknown) => {
  throw error;
});
