import { defineConfig } from "drizzle-kit";

export default defineConfig({
  driver: "pglite",
  dialect: "postgresql",
  schema: "./src/subgraphs/*/schema.ts",
  dbCredentials: {
    url: "./dev.db",
  },
});
