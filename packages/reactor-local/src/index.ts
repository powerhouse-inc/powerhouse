import { startServer } from "./server.js";

startServer().catch((error: unknown) => {
  throw error;
});
