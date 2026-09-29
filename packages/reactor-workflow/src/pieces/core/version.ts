// The core piece ships with the runtime, so it carries the runtime's version.
import pkg from "../../../package.json" with { type: "json" };

export const CORE_PIECE_VERSION: string = pkg.version;
