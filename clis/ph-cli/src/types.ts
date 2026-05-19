import type { ParsedCmdResult } from "@powerhousedao/shared/clis";
import type { accessToken } from "./commands/access-token.js";
import type { build } from "./commands/build.js";
import type {
  config as connectConfigCmd,
  connect,
  build as connectBuild,
  preview,
  studio,
} from "./commands/connect.js";
import type { generateAppCmd } from "./commands/generate-app.js";
import type { generateDocumentModelCmd } from "./commands/generate-document-model.js";
import type { generateEditorCmd } from "./commands/generate-editor.js";
import type { generateProcessorCmd } from "./commands/generate-processor.js";
import type { generateSubgraphCmd } from "./commands/generate-subgraph.js";
import type { generate } from "./commands/generate.js";
import type { init } from "./commands/init.js";
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

export type InitArgs = ParsedCmdResult<typeof init>;
export type GenerateArgs = ParsedCmdResult<typeof generate>;
export type GenerateDocumentModelArgs = ParsedCmdResult<
  typeof generateDocumentModelCmd
>;
export type GenerateEditorArgs = ParsedCmdResult<typeof generateEditorCmd>;
export type GenerateAppArgs = ParsedCmdResult<typeof generateAppCmd>;
export type GenerateProcessorArgs = ParsedCmdResult<
  typeof generateProcessorCmd
>;
export type GenerateSubgraphArgs = ParsedCmdResult<typeof generateSubgraphCmd>;
export type VetraArgs = ParsedCmdResult<typeof vetra>;
export type MigrateArgs = ParsedCmdResult<typeof migrate>;
export type BuildArgs = ParsedCmdResult<typeof build>;
export type ConnectStudioArgs = ParsedCmdResult<typeof studio>;
export type ConnectBuildArgs = ParsedCmdResult<typeof connectBuild>;
export type ConnectPreviewArgs = ParsedCmdResult<typeof preview>;
export type ConnectConfigArgs = ParsedCmdResult<typeof connectConfigCmd>;
export type ConnectArgs = ParsedCmdResult<typeof connect>;
export type AccessTokenArgs = ParsedCmdResult<typeof accessToken>;
export type InspectArgs = ParsedCmdResult<typeof inspect>;
export type ListArgs = ParsedCmdResult<typeof list>;
export type SwitchboardArgs = ParsedCmdResult<typeof switchboard>;
export type LoginArgs = ParsedCmdResult<typeof login>;
export type InstallArgs = ParsedCmdResult<typeof install>;
export type UninstallArgs = ParsedCmdResult<typeof uninstall>;
