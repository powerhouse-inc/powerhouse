#!/usr/bin/env node
import { getConfig } from "@powerhousedao/config/powerhouse";
import path from "path";
import { startServer } from "./server.js";

const config = getConfig(path.join(process.cwd(), "./powerhouse.config.json"));

startServer({
  configFile: path.join(process.cwd(), "./powerhouse.config.json"),
  dev: true,
  ...config.reactor,
  logLevel: "verbose",
}).catch(console.error);
