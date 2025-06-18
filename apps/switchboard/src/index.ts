#!/usr/bin/env node
import { config } from "./config.js";
import { startSwitchboard } from "./server.js";

startSwitchboard(config).catch(console.error);
