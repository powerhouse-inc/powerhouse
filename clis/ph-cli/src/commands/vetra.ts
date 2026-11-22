import { command, optional, positional, restPositionals, string } from "cmd-ts";
import {
  VETRA_STUDIO_HOST,
  VETRA_STUDIO_PACKAGE,
} from "../services/vetra-gateway.js";

/**
 * `ph vetra`, the gateway to Vetra Studio. cli.ts hands every `ph vetra` but
 * its help to the gateway (services/vetra-gateway.ts), which makes it the
 * `ph run` of the studio host: this command gives the help and the docs.
 */
export const vetra = command({
  name: "vetra",
  description:
    `Open Vetra Studio: \`ph vetra [verb]\` is \`ph run ${VETRA_STUDIO_HOST} [verb]\`, ` +
    `the studio host of the ${VETRA_STUDIO_PACKAGE} package. ` +
    `A project without the package gets it first: \`ph vetra\` installs it as a devDependency, ` +
    "at this ph-cli's version, with the project's package manager. " +
    "The runner arguments, --stop and --explain work as for `ph run`. " +
    "The dev mode that `ph vetra` started before 6.4 (the project's hosts/vetra) is `ph dev`.",
  args: {
    verb: positional({
      type: optional(string),
      displayName: "verb",
      description: "Verb of the studio host (default: the host's own).",
    }),
    argv: restPositionals({
      type: string,
      displayName: "runner arguments",
      description:
        "Arguments for the studio host's runner, as `ph run` takes them.",
    }),
  },
  handler: () => {
    // Not reached: cli.ts runs `ph vetra` through the gateway.
    throw new Error(
      `\`ph vetra\` is \`ph run ${VETRA_STUDIO_HOST}\`, through the gateway in cli.ts.`,
    );
  },
});
