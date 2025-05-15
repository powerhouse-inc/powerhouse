#!/usr/bin/env node
import { startSwitchboard } from "./server.js";

startSwitchboard().catch(console.error);
