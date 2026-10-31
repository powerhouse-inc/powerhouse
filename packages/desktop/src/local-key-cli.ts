import readline from "node:readline";
import {
  createKeyFile,
  signDelegation,
  WrongPasswordError,
  type SignDelegationInput,
} from "./local-key.js";

/**
 * The local key's process: the shell starts it with a command, writes one line
 * of JSON to its stdin, and reads one line back. The password travels only
 * through stdin, never the command line, and goes when this process does.
 */

function firstLine(): Promise<string> {
  return new Promise((resolve, reject) => {
    const lines = readline.createInterface({ input: process.stdin });
    lines.once("line", (line) => {
      resolve(line);
      lines.close();
    });
    lines.once("error", reject);
    lines.once("close", () => resolve(""));
  });
}

async function run(command: string | undefined, line: string) {
  switch (command) {
    case "create": {
      const { keyPath, password } = JSON.parse(line) as {
        keyPath: string;
        password: string;
      };
      return { address: await createKeyFile(keyPath, password) };
    }
    case "sign":
      return signDelegation(JSON.parse(line) as SignDelegationInput);
    default:
      throw new Error(`Unknown command ${command ?? "(none)"}`);
  }
}

/** Exits once it has written: the shell holds stdin open, which would keep this
    process alive, and the shell waiting for it. */
function reply(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`, () => process.exit(0));
}

try {
  reply({ ok: true, ...(await run(process.argv[2], await firstLine())) });
} catch (error) {
  reply({
    ok: false,
    code: error instanceof WrongPasswordError ? "WRONG_PASSWORD" : "FAILED",
    error: error instanceof Error ? error.message : String(error),
  });
}
