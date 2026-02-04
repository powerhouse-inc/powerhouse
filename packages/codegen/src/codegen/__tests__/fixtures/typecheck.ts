import { exec } from "node:child_process";

export const compile = (testDir: string) =>
  new Promise((resolve, reject) => {
    const output: { stdout: string[]; stderr: string[] } = {
      stdout: [],
      stderr: [],
    };
    const child = exec(`npm install && npx tsc --noEmit`, { cwd: testDir });
    child.stdout?.on("data", (data: string) => {
      output.stdout.push(data);
    });
    child.stderr?.on("data", (data: string) => {
      output.stderr.push(data);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(
          new Error(
            `tsc failed with code ${code}:\n${output.stdout.join("")}\n${output.stderr.join("")}`,
          ),
        );
      }
    });
  });
