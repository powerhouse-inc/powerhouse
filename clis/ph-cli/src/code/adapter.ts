import type { z } from "zod";
import { defineCommand } from "@powerhousedao/ph-clint";
import type { Command } from "@powerhousedao/ph-clint";

class ExitSignal extends Error {
  constructor(public code: number) {
    super(`process.exit(${code}) intercepted`);
  }
}

export interface AdaptOptions<TSchema extends z.ZodType> {
  id: string;
  description: string;
  inputSchema: TSchema;
  invoke: (input: z.output<TSchema>) => Promise<void>;
}

export function adaptCmdTs<TSchema extends z.ZodType>(
  opts: AdaptOptions<TSchema>,
): Command<TSchema> {
  return defineCommand({
    id: opts.id,
    description: opts.description.trim(),
    inputSchema: opts.inputSchema,
    execute: async (input, ctx) => {
      const buf: string[] = [];
      const origLog = console.log;
      const origErr = console.error;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- intercepting process.exit on purpose
      const origExit = process.exit;
      const origNonInteractive = process.env.PH_NONINTERACTIVE;

      const capture = (args: unknown[]) => {
        const line = args
          .map((a) => (typeof a === "string" ? a : safeStringify(a)))
          .join(" ");
        buf.push(line);
        ctx.stdout(line + "\n");
      };

      console.log = (...a: unknown[]) => capture(a);
      console.error = (...a: unknown[]) => capture(a);
      // Intercept process.exit so the agent REPL doesn't die.
      (process as unknown as { exit: (code?: number) => never }).exit = (
        code = 0,
      ) => {
        throw new ExitSignal(code);
      };
      process.env.PH_NONINTERACTIVE = "1";

      try {
        await opts.invoke(input);
      } catch (e) {
        if (e instanceof ExitSignal) {
          if (e.code !== 0) {
            buf.push(`(command exited with code ${e.code})`);
          }
        } else {
          throw e;
        }
      } finally {
        console.log = origLog;
        console.error = origErr;
        (process as unknown as { exit: typeof origExit }).exit = origExit;
        if (origNonInteractive === undefined) {
          delete process.env.PH_NONINTERACTIVE;
        } else {
          process.env.PH_NONINTERACTIVE = origNonInteractive;
        }
      }

      return buf.join("\n");
    },
  });
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
