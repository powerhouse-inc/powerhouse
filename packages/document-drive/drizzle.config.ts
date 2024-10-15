import { defineConfig } from "drizzle-kit";

export default process.env.DATABASE_URL !== "" &&
process.env.DATABASE_URL !== undefined
  ? defineConfig({
      dialect: "postgresql",
      schema: "./src/storage/drizzle/schema.ts",
      out: "./drizzle",
      dbCredentials: {
        url: process.env.DATABASE_URL,
      },
    })
  : defineConfig({
      driver: "pglite",
      dialect: "postgresql",
      schema: "./src/storage/drizzle/schema.ts",
      dbCredentials: {
        url: "file:./dev.db",
      },
    });
