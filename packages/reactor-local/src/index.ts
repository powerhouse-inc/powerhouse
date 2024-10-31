import { startServer } from "./server";

startServer().catch((error: unknown) => {
  throw error;
});
