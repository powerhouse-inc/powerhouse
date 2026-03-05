import type { ArgParser } from "cmd-ts/dist/cjs/argparser.js";

export type ParsedCmdResult<P> = P extends ArgParser<infer Out> ? Out : never;
