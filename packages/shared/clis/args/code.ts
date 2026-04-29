import { restPositionals, string } from "cmd-ts";

export const codeArgs = {
  rest: restPositionals({
    type: string,
    displayName: "args",
    description: "Optional prompt or subcommand to forward to ph-clint.",
  }),
};
