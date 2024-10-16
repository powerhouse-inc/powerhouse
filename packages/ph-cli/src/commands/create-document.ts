import { Command } from "commander";

export function createDocumentCommand(program: Command) {
  program
    .command("create-document")
    .description("Create a new document")
    .action(() => {
      console.log("Creating a new document...");
    });
}
