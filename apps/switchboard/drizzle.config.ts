import dotenv from "dotenv";
dotenv.config();
import { defineConfig } from "drizzle-kit";
export default defineConfig({
    dialect: "postgresql",
    schema: "./subgraphs/*/schema.ts",
    out: "./drizzle",
    dbCredentials: {
        url: process.env.DATABASE_URL as string,
    }
});