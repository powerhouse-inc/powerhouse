import { defineConfig } from "drizzle-kit";
export default defineConfig({
  driver: "pglite",
  dialect: "postgresql",
  schema: ["processors/contributor-bill-analyzer/src/schema.ts"],
  dbCredentials: {
    url: "./dev.db",
  },
});
