import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';
dotenv.config();

console.log(process.env.DATABASE_URL);
export default process.env.DATABASE_URL !== '' &&
process.env.DATABASE_URL !== undefined
    ? defineConfig({
          dialect: 'postgresql',
          schema: './subgraphs/*/schema.ts',
          out: './drizzle',
          dbCredentials: {
              url: process.env.DATABASE_URL,
          },
      })
    : defineConfig({
          driver: 'pglite',
          dialect: 'postgresql',
          schema: './subgraphs/*/schema.ts',
          dbCredentials: {
              url: 'file:./dev.db',
          },
      });
