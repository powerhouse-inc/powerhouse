import { Router } from "express";
import path from "node:path";
import type { ServeStaticOptions } from "serve-static";
import serveStatic from "serve-static";
import { loadPackage, scanPackages } from "./packages.js";

export const DefaultServeStaticOptions: ServeStaticOptions = {
  dotfiles: "deny",
  etag: true,
  extensions: ["js", "mjs", "css", "json", "wasm", "index.js"],
  index: ["index.js", "/index.mjs"],
  redirect: true,
};

export function createRegistryRouter(
  root: string,
  options: ServeStaticOptions = DefaultServeStaticOptions,
): Router {
  const serveStaticMiddleware = serveStatic(root, options);
  const absDir = path.resolve(root);
  const router = Router();

  // CORS on every response
  router.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  });

  // Package listing API
  router.get("/packages", (_req, res) => {
    const packages = scanPackages(absDir);
    res.json(packages);
  });

  // Get package info (wildcard to support scoped names like @powerhousedao/vetra)
  router.get("/packages/*name", (req, res) => {
    const name = req.params.name.join("/");
    console.log("name", req.params.name);
    const pkg = loadPackage(absDir, name);
    if (!pkg) {
      res.status(404).send("Package not found");
      return;
    }
    res.json(pkg);
  });

  router.use("/", serveStaticMiddleware);

  return router;
}
