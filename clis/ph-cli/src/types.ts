import type { accessToken } from "./commands/access-token.js";
import type { getPackageManagerCommand } from "./commands/common-args.js";
import type { build, preview, studio } from "./commands/connect.js";
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

export type GenerateArgs = Awaited<ReturnType<typeof generate.handler>>;
export type VetraArgs = Awaited<ReturnType<typeof vetra.handler>>;
export type MigrateArgs = Awaited<ReturnType<typeof migrate.handler>>;
export type ConnectStudioArgs = Awaited<ReturnType<typeof studio.handler>>;
export type ConnectBuildArgs = Awaited<ReturnType<typeof build.handler>>;
export type ConnectPreviewArgs = Awaited<ReturnType<typeof preview.handler>>;
export type ConnectArgs = ConnectStudioArgs &
  ConnectBuildArgs &
  ConnectPreviewArgs;
export type AccessTokenArgs = Awaited<ReturnType<typeof accessToken.handler>>;
export type InspectArgs = Awaited<ReturnType<typeof inspect.handler>>;
export type ListArgs = Awaited<ReturnType<typeof list.handler>>;
export type SwitchboardArgs = Awaited<ReturnType<typeof switchboard.handler>>;
export type LoginArgs = Awaited<ReturnType<typeof login.handler>>;
export type InstallArgs = Awaited<ReturnType<typeof install.handler>>;
export type UninstallArgs = Awaited<ReturnType<typeof uninstall.handler>>;
export type PackageManagerArgs = Partial<
  Awaited<ReturnType<typeof getPackageManagerCommand.handler>>
>;
