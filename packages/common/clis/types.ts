import type { ArgParser } from "cmd-ts/dist/cjs/argparser.js";
import type { getPackageManagerCommand } from "./args/common.js";
import type {
  DRIVES_PRESERVE_STRATEGIES,
  LOG_LEVELS,
  SERVICE_ACTIONS,
} from "./constants.js";

export type ServiceActions = typeof SERVICE_ACTIONS;
export type ServiceAction = ServiceActions[number];
export type DrivePreserveStrategies = typeof DRIVES_PRESERVE_STRATEGIES;
export type DrivePreserveStrategy = DrivePreserveStrategies[number];
export type LogLevels = typeof LOG_LEVELS;
export type LogLevel = LogLevels[number];

export type ParsedCmdResult<P> = P extends ArgParser<infer Out> ? Out : never;
export type PackageManagerArgs = ParsedCmdResult<
  typeof getPackageManagerCommand
>;

export type PathValidation = (dir: string) => boolean;
