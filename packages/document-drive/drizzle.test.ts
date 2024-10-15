import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/storage/drizzle/schema.ts",
  out: "./drizzle",
  driver: "pglite",
  dbCredentials: {
    url: "./dev.db",
  },
});
