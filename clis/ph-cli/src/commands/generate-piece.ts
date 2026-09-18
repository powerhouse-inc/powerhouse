import { debugArgs } from "@powerhousedao/shared/clis/args";
import {
  command,
  flag,
  oneOf,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
import { Directory } from "cmd-ts/dist/cjs/batteries/fs.js";

export const generatePieceCmd = command({
  name: "piece",
  description:
    "Generate a piece: a connector whose actions and triggers a workflow can call",
  args: {
    namePositional: positional({
      type: optional(string),
      displayName: "name",
      description:
        "The name of the piece to generate. Its directory is the kebab-case of this.",
    }),
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "The name of the piece to generate",
    }),
    id: option({
      type: optional(string),
      long: "id",
      description:
        "The piece id a workflow block type names, e.g. @acme/piece-crm. Defaults to one derived from the package name.",
    }),
    pieceVersion: option({
      type: optional(string),
      long: "piece-version",
      description:
        "The version the pieces list declares. Defaults to the package version when the piece is named after the package, else 1.0.0.",
    }),
    auth: option({
      type: oneOf(["none", "secret", "custom"] as const),
      long: "auth",
      description: "The kind of connection the piece asks for",
      defaultValue: () => "custom" as const,
      defaultValueIsSerializable: true,
    }),
    description: option({
      type: optional(string),
      long: "description",
      description: "One line describing what the piece connects to",
    }),
    dir: option({
      type: optional(Directory),
      long: "dir",
      description: "Name of the directory of an existing piece to re-register",
    }),
    all: flag({
      long: "all",
      short: "a",
      description:
        "Re-register every piece in pieces/: refresh the pieces list and the manifest, and prune what is gone",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGeneratePiece } =
      await import("../services/generate-piece.js");
    await startGeneratePiece(args, process.cwd());
    process.exit(0);
  },
});
