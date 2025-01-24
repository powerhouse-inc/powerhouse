#! /usr/bin/env node
import { Command } from "commander";
import { startServer } from "./server.js";

type ReactorLocalOptions = {
  port?: string;
  host?: string;
  https?: boolean;
  configFile?: string;
  localEditors?: string;
  localDocuments?: string;
};

type ReactorLocalAction = (options: ReactorLocalOptions) => void;

const reactorLocalAction: ReactorLocalAction = (options) => {
  startServer(options).catch((error: unknown) => {
    throw error;
  });
};

const program = new Command();

program
  .name("Reactor Local")
  .description("Reactor Local CLI")
  .option("-p, --port <port>", "Port to run the server on", "4001")
  .option(
    "-le, --local-editors <localEditors>",
    "Link local document editors path",
  )
  .option(
    "-ld, --local-documents <localDocuments>",
    "Link local documents path",
  )
  .action(reactorLocalAction);

program
  .command("help")
  .description("Display help information")
  .action(() => {
    program.help();
  });

program.parse(process.argv);
