import { Worker } from "node:worker_threads";

const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
  type: "module",
  execArgv: ["--conditions=browser"],
});
const result = await new Promise((resolve, reject) => {
  worker.once("message", resolve);
  worker.once("error", reject);
  worker.once("exit", (code) => {
    if (code !== 0) reject(new Error(`Worker exited with code ${code}.`));
  });
});
await worker.terminate();
process.stdout.write(`__PH_B5_WORKER__${JSON.stringify(result)}\n`);
