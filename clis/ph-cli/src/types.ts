import type {
  getPackageManagerCommand,
  ParsedCmdResult,
} from "@powerhousedao/common/clis";
import type { accessToken } from "./commands/access-token.js";
import type { build, connect, preview, studio } from "./commands/connect.js";
import type { generate } from "./commands/generate.js";
import type { inspect } from "./commands/inspect.js";
import type { install } from "./commands/install.js";
import type { list } from "./commands/list.js";
import type { login } from "./commands/login.js";
import type { migrate } from "./commands/migrate.js";
import type { switchboard } from "./commands/switchboard.js";
import type { uninstall } from "./commands/uninstall.js";
import type { vetra } from "./commands/vetra.js";

export type CommandActionType<Args extends any[], Return = void> = (
  ...args: Args
) => Return | Promise<Return>;

export type GenerateArgs = ParsedCmdResult<typeof generate>;
export type VetraArgs = ParsedCmdResult<typeof vetra>;
export type MigrateArgs = ParsedCmdResult<typeof migrate>;
export type ConnectStudioArgs = ParsedCmdResult<typeof studio>;
export type ConnectBuildArgs = ParsedCmdResult<typeof build>;
export type ConnectPreviewArgs = ParsedCmdResult<typeof preview>;
export type ConnectArgs = ParsedCmdResult<typeof connect>;
export type AccessTokenArgs = ParsedCmdResult<typeof accessToken>;
export type InspectArgs = ParsedCmdResult<typeof inspect>;
export type ListArgs = ParsedCmdResult<typeof list>;
export type SwitchboardArgs = ParsedCmdResult<typeof switchboard>;
export type LoginArgs = ParsedCmdResult<typeof login>;
export type InstallArgs = ParsedCmdResult<typeof install>;
export type UninstallArgs = ParsedCmdResult<typeof uninstall>;
