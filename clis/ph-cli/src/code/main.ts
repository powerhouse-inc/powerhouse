#!/usr/bin/env node
import { buildPhCodeCli } from "./cli.js";

const cli = buildPhCodeCli();
// No user args → drop into the interactive REPL by default.
const userArgs = process.argv.slice(2);
const argv =
  userArgs.length === 0
    ? [process.argv[0], process.argv[1], "-i"]
    : process.argv;
await cli.run(argv);
