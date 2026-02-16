import express from "express";
import path from "node:path";
import { createRegistryRouter } from "./middleware.js";

const packagesDir = process.argv[2] || process.env.REGISTRY_DIR || ".";
const port = process.argv[3] || process.env.PORT || "8080";

const absDir = path.resolve(packagesDir);

const app = express();
app.use(createRegistryRouter(absDir));

app.listen(Number(port), () => {
  console.log(`serving ${absDir} on http://localhost:${port}`);
});
