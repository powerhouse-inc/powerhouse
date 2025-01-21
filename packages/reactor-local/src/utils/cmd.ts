import { exec } from "child_process";

export function cmd(command: string): Promise<string> {
  return new Promise((resolve) =>
    exec(command, (err, stdout) => {
      resolve(stdout.trim());
    }),
  );
}
