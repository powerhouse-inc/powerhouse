import { defineConfig } from "drizzle-kit";

export default defineConfig({
  driver: "pglite",
  dialect: "postgresql",
  schema: "node_modules/@powerhousedao/general-document-indexer/src/schema.ts",
  dbCredentials: {
    url: "./dev.db",
  },
});