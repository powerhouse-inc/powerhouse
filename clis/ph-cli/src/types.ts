import type { generate } from "./commands/generate.js";
import type { migrate } from "./commands/migrate.js";
import type { vetra } from "./commands/vetra.js";

export type CommandActionType<Args extends any[], Return = void> = (
  ...args: Args
) => Return | Promise<Return>;

export type GenerateArgs = Awaited<ReturnType<typeof generate.handler>>;
export type VetraArgs = Awaited<ReturnType<typeof vetra.handler>>;
export type MigrateArgs = Awaited<ReturnType<typeof migrate.handler>>;
