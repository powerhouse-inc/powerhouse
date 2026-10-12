// Vite emits an empty worker chunk, without failing, if the worker entry is tree-shaken.
import { readdirSync, readFileSync } from "node:fs";

const assets = new URL("../dist/assets/", import.meta.url);
const chunks = readdirSync(assets).filter((file) =>
  /^reactor-monitor\.worker-.*\.js$/.test(file),
);

if (chunks.length !== 1) {
  console.error(`expected one reactor-monitor worker chunk, found ${chunks}`);
  process.exit(1);
}

const code = readFileSync(new URL(chunks[0], assets), "utf8");
if (!code.includes("onconnect")) {
  console.error(
    `${chunks[0]} (${code.length} bytes) never assigns onconnect: the worker entry was tree-shaken`,
  );
  process.exit(1);
}
